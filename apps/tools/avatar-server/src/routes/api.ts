import { Router } from 'express';
import { AvatarService } from '../services/AvatarService';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('avatar-api');

export function createApiRouter(avatarService: AvatarService): Router {
  const router = Router();

  // Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });

  // Get current status
  router.get('/status', (req, res) => {
    res.json(avatarService.getStatus());
  });

  // Get current expression with full details
  router.get('/current-expression', (req, res) => {
    const current = avatarService.getCurrentExpression();
    if (current) {
      res.json(current);
    } else {
      res.status(404).json({ error: 'No expression set' });
    }
  });

  // List expressions
  router.get('/expressions', (req, res) => {
    res.json({
      expressions: avatarService.listExpressions(),
      current: avatarService.getCurrentExpression()
    });
  });

  // Set expression
  router.post('/expression', (req, res) => {
    try {
      const { name, ...state } = req.body;
      const result = avatarService.setExpression(name, state);
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Error setting expression:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  // Set batch expressions
  router.post('/batch', (req, res) => {
    try {
      const result = avatarService.setBatchExpressions(req.body);
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Error setting batch expressions:', error);
      res.status(400).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  return router;
}