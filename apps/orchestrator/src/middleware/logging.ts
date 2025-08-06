import { Request, Response, NextFunction } from 'express';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('orchestrator');

export function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  // Log request
  logger.info(`${req.method} ${req.path}`, {
    body: req.body,
    query: req.query
  });

  // Log response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    logger.debug(`Response: ${res.statusCode} (${duration}ms)`);
    return originalSend.call(this, data);
  };

  next();
}