import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../services/logger';

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
        });
        return;
      }

      req.body = result.data;
      next();
    } catch (error) {
      logger.error('Validation error', { error: (error as Error).message });
      res.status(500).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed' },
      });
    }
  };
};

export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.query);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: errors },
        });
        return;
      }

      req.query = result.data as Record<string, string>;
      next();
    } catch (error) {
      logger.error('Query validation error', { error: (error as Error).message });
      res.status(500).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed' },
      });
    }
  };
};

export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.params);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid route parameters', details: errors },
        });
        return;
      }

      req.params = result.data;
      next();
    } catch (error) {
      logger.error('Params validation error', { error: (error as Error).message });
      res.status(500).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed' },
      });
    }
  };
};

export const handleZodError = (error: ZodError): { field: string; message: string; code: string }[] => {
  return error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));
};