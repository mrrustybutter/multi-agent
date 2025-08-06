import { Router, Request, Response } from 'express';
import { getLogger } from '@rusty-butter/logger';
import { ClaudeManager } from '../services/ClaudeManager';

const logger = getLogger('admin-route');

export function createAdminRouter(claudeManager: ClaudeManager): Router {
  const router = Router();

  // Clean up stuck Claude instances
  router.post('/admin/cleanup', (req: Request, res: Response) => {
    try {
      claudeManager.cleanup();
      const remaining = claudeManager.getActiveClaudes();
      
      res.json({
        message: 'Cleanup completed',
        remainingInstances: remaining.length
      });
    } catch (error) {
      logger.error('Failed to cleanup:', error);
      res.status(500).json({ 
        error: 'Failed to cleanup instances',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Force clear all Claude instances
  router.post('/admin/clear-all', (req: Request, res: Response) => {
    try {
      claudeManager.clearAll();
      
      res.json({
        message: 'All Claude instances cleared',
        remainingInstances: 0
      });
    } catch (error) {
      logger.error('Failed to clear all:', error);
      res.status(500).json({ 
        error: 'Failed to clear instances',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}