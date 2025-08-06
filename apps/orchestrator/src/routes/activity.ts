import { Router, Request, Response } from 'express';
import { getLogger } from '@rusty-butter/logger';
import { eventService } from '@rusty-butter/shared';

const router: Router = Router();
const logger = getLogger('activity-route');

// Get events with filtering
router.get('/events', async (req: Request, res: Response) => {
  try {
    const {
      filter,
      timeRange,
      limit = '50',
      offset = '0'
    } = req.query;

    // Calculate date range
    let startDate: Date | undefined;
    const endDate = new Date();
    
    switch (timeRange) {
      case '1h':
        startDate = new Date(endDate.getTime() - 3600000);
        break;
      case '24h':
        startDate = new Date(endDate.getTime() - 86400000);
        break;
      case '7d':
        startDate = new Date(endDate.getTime() - 604800000);
        break;
      case '30d':
        startDate = new Date(endDate.getTime() - 2592000000);
        break;
    }

    // Build query
    const query: any = {
      startDate,
      endDate,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    };

    if (filter) {
      query.type = filter;
    }

    // Get events
    const events = await eventService.queryEvents(query);

    res.json({ events });

  } catch (error) {
    logger.error('Failed to get events:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// Get event statistics
router.get('/events/stats', async (req: Request, res: Response) => {
  try {
    const startDate = new Date(Date.now() - 86400000); // Last 24 hours
    const stats = await eventService.getEventStats(startDate);
    
    res.json(stats);

  } catch (error) {
    logger.error('Failed to get event statistics:', error);
    res.status(500).json({ error: 'Failed to get event statistics' });
  }
});

// Log new event
router.post('/events', async (req: Request, res: Response) => {
  try {
    const event = await eventService.logEvent(req.body);
    
    res.json({
      eventId: event.id,
      status: 'accepted',
      message: 'Event logged successfully'
    });

  } catch (error) {
    logger.error('Failed to log event:', error);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

// Update event status
router.put('/events/:eventId', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const event = await eventService.updateEvent(eventId, req.body);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json(event);

  } catch (error) {
    logger.error('Failed to update event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Get event details
router.get('/events/:eventId', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    // Query by correlation ID to find specific event
    const events = await eventService.queryEvents({ correlationId: eventId });
    
    if (events.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json(events[0]);

  } catch (error) {
    logger.error('Failed to get event:', error);
    res.status(500).json({ error: 'Failed to get event' });
  }
});

export default router;