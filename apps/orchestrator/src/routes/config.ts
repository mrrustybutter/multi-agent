import { Router, Request, Response } from 'express';
import { getLogger } from '@rusty-butter/logger';
import { configService } from '@rusty-butter/shared';

const router: Router = Router();
const logger = getLogger('config-route');

// Get current configuration
router.get('/config', async (req: Request, res: Response) => {
  try {
    const config = await configService.getConfig();
    
    // Return sanitized config (remove sensitive data if needed)
    res.json({
      monitoring: config.monitoring,
      audio: config.audio,
      memory: config.memory,
      ports: config.ports,
      urls: config.urls,
      performance: config.performance,
      notifications: config.notifications,
      // Don't expose all API keys, just enabled status
      llmProviders: {
        openai: { enabled: config.llmProviders.openai.enabled },
        claude: { enabled: config.llmProviders.claude.enabled },
        gemini: { enabled: config.llmProviders.gemini.enabled },
        grok: { enabled: config.llmProviders.grok.enabled },
        groq: { enabled: config.llmProviders.groq.enabled }
      }
    });
    
  } catch (error) {
    logger.error('Failed to get configuration:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// Update configuration (protected endpoint)
router.put('/config', async (req: Request, res: Response) => {
  try {
    // TODO: Add authentication/authorization
    const updates = req.body;
    const updatedBy = req.headers['x-updated-by'] as string || 'api';
    
    const config = await configService.updateConfig(updates, updatedBy);
    
    res.json({
      message: 'Configuration updated successfully',
      config
    });
    
  } catch (error) {
    logger.error('Failed to update configuration:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

export default router;