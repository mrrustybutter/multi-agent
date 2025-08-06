import { Router, Request, Response } from 'express';
import { getLogger } from '@rusty-butter/logger';
import { eventService } from '@rusty-butter/shared';
import { Event } from '../types';
import { EventProcessor } from '../services/EventProcessor';

const logger = getLogger('events-route');

export function createEventsRouter(eventProcessor: EventProcessor): Router {
  const router = Router();

  // Submit a new event
  router.post('/event', async (req: Request, res: Response) => {
    try {
      const { source, type, priority = 'medium', data, context, requiredTools } = req.body;

      if (!source || !type || !data) {
        return res.status(400).json({ 
          error: 'Missing required fields: source, type, data' 
        });
      }

      // Create event
      const event: Event = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        source,
        type,
        priority,
        data,
        context,
        requiredTools,
        timestamp: new Date()
      };

      logger.info(`Logging event ${event.id}: ${type} from ${source}`);

      // Log event to MongoDB FIRST
      await eventService.logEvent({
        source,
        type,
        priority,
        data,
        metadata: {
          context,
          requiredTools,
          eventId: event.id
        },
        correlationId: event.id,
        status: 'pending'
      });

      logger.info(`Event ${event.id} logged to database, queuing for processing`);

      // Queue event for processing
      await eventProcessor.queueEvent(event);

      res.json({
        eventId: event.id,
        status: 'accepted',
        message: `Event logged and queued for processing (queue size: ${eventProcessor.getStatus().queueSize})`
      });

    } catch (error) {
      logger.error('Failed to process event:', error);
      res.status(500).json({ 
        error: 'Failed to process event',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get event history
  router.get('/events', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const events = eventProcessor.getEventHistory().slice(0, limit);
    res.json(events);
  });

  return router;
}