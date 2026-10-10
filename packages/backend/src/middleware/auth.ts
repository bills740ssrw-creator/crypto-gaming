import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../services/jwt';
import { JWTPayload } from '@crypto-gaming/shared';
import { logger } from '../services/logger';
import { UnauthorizedError } from './errorHandler';

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
  userId?: string;
}

export function requireUserId(req: AuthenticatedRequest): string {
  if (!req.userId) {
    throw new UnauthorizedError('Authentication required');
  }
  return req.userId;
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const payload = jwtService.verifyAccessToken(token);
    
    if (!payload) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
      });
      return;
    }

    req.user = payload;
    req.userId = payload.userId;
    next();
  } catch (error) {
    logger.error('Authentication error', { error: (error as Error).message });
    res.status(401).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: 'Authentication failed' },
    });
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);
    
    if (token) {
      const payload = jwtService.verifyAccessToken(token);
      if (payload) {
        req.user = payload;
        req.userId = payload.userId;
      }
    }
    next();
  } catch {
    next();
  }
};

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || !req.user.isAdmin) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
    return;
  }
  next();
};

export const requireKYC = (minLevel: number = 1) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    if (req.user.kycLevel < minLevel) {
      res.status(403).json({
        success: false,
        error: { code: 'KYC_REQUIRED', message: `KYC level ${minLevel} required` },
      });
      return;
    }
    next();
  };
};

export const requireRegion = (allowedRegions: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    if (!allowedRegions.includes(req.user.region)) {
      res.status(403).json({
        success: false,
        error: { code: 'REGION_RESTRICTED', message: 'This feature is not available in your region' },
      });
      return;
    }
    next();
  };
};