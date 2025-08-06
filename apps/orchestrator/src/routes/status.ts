import { Router, Request, Response } from 'express';
import { EventProcessor } from '../services/EventProcessor';
import { ClaudeManager } from '../services/ClaudeManager';

export function createStatusRouter(
  eventProcessor: EventProcessor,
  claudeManager: ClaudeManager
): Router {
  const router = Router();

  // Get system status
  router.get('/status', (req: Request, res: Response) => {
    const eventStatus = eventProcessor.getStatus();
    const activeClaudes = claudeManager.getActiveClaudes();
    const activeLLMOps = eventProcessor.getActiveLLMOperations();
    
    res.json({
      activeLLMs: {
        claude: activeClaudes.map(instance => ({
          id: instance.id,
          eventId: instance.eventId,
          role: instance.role,
          status: instance.status,
          provider: 'anthropic',
          uptime: Date.now() - instance.startTime.getTime()
        })),
        others: activeLLMOps.map(op => ({
          id: op.id,
          eventId: op.eventId,
          provider: op.provider,
          type: op.type,
          status: op.status,
          uptime: op.uptime
        }))
      },
      queueSize: eventStatus.queueSize,
      queuePending: eventStatus.queuePending,
      voiceQueueSize: eventStatus.voiceQueueSize,
      voiceQueuePending: eventStatus.voiceQueuePending,
      mcpServers: [], // This would be populated from MCP connection manager
      eventHistory: eventStatus.eventHistory
    });
  });

  // Health check
  router.get('/health', (req: Request, res: Response) => {
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });

  return router;
}