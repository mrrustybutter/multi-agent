import { Router, Request, Response } from 'express';
import { getLogger } from '@rusty-butter/logger';
import { ClaudeConfig } from '../types';
import { ClaudeManager } from '../services/ClaudeManager';

const logger = getLogger('claude-route');

export function createClaudeRouter(claudeManager: ClaudeManager): Router {
  const router = Router();

  // Spawn a new Claude instance (called by parent Claude instances)
  router.post('/claude/spawn', async (req: Request, res: Response) => {
    try {
      const { 
        role, 
        prompt, 
        mcpServers = [], 
        detached = false,
        parentId,
        eventId 
      } = req.body;

      if (!role || !prompt) {
        return res.status(400).json({ 
          error: 'Missing required fields: role, prompt' 
        });
      }

      const config: ClaudeConfig = {
        role,
        prompt,
        mcpServers,
        detached
      };

      logger.info(`Spawning child Claude with role: ${role} for parent: ${parentId}`);
      
      const instanceId = await claudeManager.spawnClaude(
        config, 
        eventId || 'manual',
        parentId
      );

      res.json({
        instanceId,
        status: 'spawned'
      });

    } catch (error) {
      logger.error('Failed to spawn Claude:', error);
      res.status(500).json({ 
        error: 'Failed to spawn Claude instance',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get Claude instance status
  router.get('/claude/:id', (req: Request, res: Response) => {
    const instance = claudeManager.getClaudeInstance(req.params.id);
    
    if (!instance) {
      return res.status(404).json({ 
        error: 'Claude instance not found' 
      });
    }

    res.json({
      id: instance.id,
      eventId: instance.eventId,
      role: instance.role,
      status: instance.status,
      uptime: Date.now() - instance.startTime.getTime(),
      parentId: instance.parentId,
      children: instance.children
    });
  });

  // List all active Claude instances
  router.get('/claude', (req: Request, res: Response) => {
    const instances = claudeManager.getActiveClaudes();
    
    res.json(instances.map(instance => ({
      id: instance.id,
      eventId: instance.eventId,
      role: instance.role,
      status: instance.status,
      uptime: Date.now() - instance.startTime.getTime()
    })));
  });

  return router;
}