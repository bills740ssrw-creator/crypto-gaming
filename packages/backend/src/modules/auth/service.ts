import { User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { jwtService } from '../../services/jwt';
import { balanceService } from '../../services/balance';
import { prisma } from '../../services/prisma';
import { logger } from '../../services/logger';
import { generateReferralCode, validatePassword } from '@crypto-gaming/shared';
import { AppError, ConflictError, UnauthorizedError, NotFoundError } from '../../middleware/errorHandler';
import { RegisterInput, LoginInput, ChangePasswordInput, KYCInput } from './schemas';

export class AuthService {
  private static instance: AuthService;

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async register(input: RegisterInput): Promise<{ user: Omit<User, 'passwordHash'>; tokens: { accessToken: string; refreshToken: string; expiresIn: number } }> {
    const passwordValidation = validatePassword(input.password);
    if (!passwordValidation.valid) {
      throw new AppError(passwordValidation.message!, 400, 'WEAK_PASSWORD');
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { username: input.username }],
      },
    });

    if (existingUser) {
      if (existingUser.email === input.email) {
        throw new ConflictError('Email already registered', { field: 'email' });
      }
      throw new ConflictError('Username already taken', { field: 'username' });
    }

    let referredBy: string | undefined;
    if (input.referralCode) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: input.referralCode },
        select: { id: true },
      });
      if (referrer) {
        referredBy = referrer.id;
      }
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const referralCode = generateReferralCode(input.username);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: input.email,
          username: input.username,
          passwordHash,
          region: input.region,
          referralCode,
          referredBy,
        },
      });

      await balanceService.ensureWalletsExist(newUser.id, input.region, tx);

      return newUser;
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    const tokens = jwtService.generateTokens({
      userId: user.id,
      email: user.email,
      username: user.username,
      region: user.region,
      isAdmin: user.isAdmin,
      kycLevel: user.kycLevel,
    });

    await this.createRefreshToken(user.id, tokens.refreshToken);

    logger.info('User registered', { userId: user.id, email: user.email, region: user.region });

    return { user: userWithoutPassword, tokens };
  }

  async login(input: LoginInput): Promise<{ user: Omit<User, 'passwordHash'>; tokens: { accessToken: string; refreshToken: string; expiresIn: number } }> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    const tokens = jwtService.generateTokens({
      userId: user.id,
      email: user.email,
      username: user.username,
      region: user.region,
      isAdmin: user.isAdmin,
      kycLevel: user.kycLevel,
    });

    await this.createRefreshToken(user.id, tokens.refreshToken);

    logger.info('User logged in', { userId: user.id, email: user.email });

    return { user: userWithoutPassword, tokens };
  }

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const payload = jwtService.verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expired');
    }

    await prisma.refreshToken.delete({ where: { token: refreshToken } });

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, username: true, region: true, isAdmin: true, isActive: true, kycLevel: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or deactivated');
    }

    const tokens = jwtService.generateTokens({
      userId: user.id,
      email: user.email,
      username: user.username,
      region: user.region,
      isAdmin: user.isAdmin,
      kycLevel: user.kycLevel,
    });

    await this.createRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { userId, token: refreshToken },
      });
    } else {
      await prisma.refreshToken.deleteMany({ where: { userId } });
    }
    logger.info('User logged out', { userId });
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    const isValidPassword = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const passwordValidation = validatePassword(input.newPassword);
    if (!passwordValidation.valid) {
      throw new AppError(passwordValidation.message!, 400, 'WEAK_PASSWORD');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await prisma.refreshToken.deleteMany({ where: { userId } });

    logger.info('Password changed', { userId });
  }

  async updateProfile(userId: string, input: { username?: string; email?: string }): Promise<Omit<User, 'passwordHash'>> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    if (input.username && input.username !== user.username) {
      const existing = await prisma.user.findUnique({ where: { username: input.username } });
      if (existing) {
        throw new ConflictError('Username already taken', { field: 'username' });
      }
    }

    if (input.email && input.email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw new ConflictError('Email already registered', { field: 'email' });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: input,
    });

    const { passwordHash: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async submitKYC(userId: string, input: KYCInput): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    if (user.kycLevel >= input.level) {
      throw new AppError('KYC level already achieved', 400, 'KYC_ALREADY_VERIFIED');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        kycLevel: input.level,
        kycVerified: input.level >= 1,
      },
    });

    logger.info('KYC submitted', { userId, level: input.level });
  }

  async getProfile(userId: string): Promise<Omit<User, 'passwordHash'> | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid password');
    }

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.gameHistory.deleteMany({ where: { userId } });
      await tx.gameSession.deleteMany({ where: { userId } });
      await tx.cryptoWallet.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    logger.info('Account deleted', { userId });
  }

  private async createRefreshToken(userId: string, token: string): Promise<void> {
    const decoded = jwtService.decodeToken(token);
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: { userId, token, expiresAt },
    });
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }
}

export const authService = AuthService.getInstance();