import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JWTPayload, AuthTokens } from '@crypto-gaming/shared';

export class JWTService {
  private static instance: JWTService;

  private constructor() {}

  static getInstance(): JWTService {
    if (!JWTService.instance) {
      JWTService.instance = new JWTService();
    }
    return JWTService.instance;
  }

  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiry as jwt.SignOptions['expiresIn'],
      issuer: 'crypto-gaming',
      audience: 'crypto-gaming-api',
    });
  }

  generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiry as jwt.SignOptions['expiresIn'],
      issuer: 'crypto-gaming',
      audience: 'crypto-gaming-api',
    });
  }

  generateTokens(payload: Omit<JWTPayload, 'iat' | 'exp'>): AuthTokens {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);
    
    const decoded = jwt.decode(accessToken) as JWTPayload;
    const expiresIn = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 900;

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  verifyAccessToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, config.jwt.accessSecret, {
        issuer: 'crypto-gaming',
        audience: 'crypto-gaming-api',
      }) as JWTPayload;
    } catch {
      return null;
    }
  }

  verifyRefreshToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, config.jwt.refreshSecret, {
        issuer: 'crypto-gaming',
        audience: 'crypto-gaming-api',
      }) as JWTPayload;
    } catch {
      return null;
    }
  }

  decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch {
      return null;
    }
  }

  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }
}

export const jwtService = JWTService.getInstance();