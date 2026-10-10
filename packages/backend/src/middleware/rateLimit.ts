import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../services/logger';
import { createRateLimitStore, RateLimitStore } from '../services/rate-limit-store';
import { AuthenticatedRequest } from './auth';

interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (req: AuthenticatedRequest) => string;
  store?: RateLimitStore;
}

const defaultOptions: RateLimitOptions = {
  windowMs: config.rateLimit.windowMs,
  maxRequests: config.rateLimit.maxRequests,
  keyGenerator: (req) => req.ip || 'unknown',
  store: createRateLimitStore(),
};

export const rateLimit = (options: RateLimitOptions = {}) => {
  const opts = { ...defaultOptions, ...options };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = `ratelimit:${opts.keyGenerator!(req)}`;
      const { count: current, ttl } = await opts.store!.hit(key, opts.windowMs!);
      const resetTime = Date.now() + ttl;

      res.setHeader('X-RateLimit-Limit', opts.maxRequests!.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, opts.maxRequests! - current).toString());
      res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());

      if (current > opts.maxRequests!) {
        logger.warn('Rate limit exceeded', { path: req.path, current, limit: opts.maxRequests });

        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
            details: { retryAfter: Math.ceil(ttl / 1000) },
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Rate limit error', { error: (error as Error).message });
      next();
    }
  };
};

export const strictRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 10,
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  keyGenerator: (req) => `auth:${req.ip}`,
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 60,
});

export const websocketRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyGenerator: (req) => `ws:${req.ip}`,
});

/**
 * Wagers commit funds, so they get a much tighter budget than the general API
 * limit: five requests per second per authenticated user, falling back to IP
 * for unauthenticated traffic.
 */
export const wagerRateLimit = rateLimit({
  windowMs: 1000,
  maxRequests: 5,
  keyGenerator: (req) => `wager:${req.userId || req.ip}`,
});
