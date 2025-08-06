import { Request, Response, NextFunction } from 'express';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('orchestrator');

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  logger.error('Unhandled error:', err);
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
}