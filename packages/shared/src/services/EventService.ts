import { getLogger } from '@rusty-butter/logger';
import { Event, IEvent } from '../models/Event';
import { db } from './DatabaseService';

const logger = getLogger('event-service');

export interface EventQuery {
  type?: string | string[];
  source?: string | string[];
  status?: string | string[];
  user?: string;
  startDate?: Date;
  endDate?: Date;
  correlationId?: string;
  limit?: number;
  offset?: number;
  sort?: Record<string, 1 | -1>;
}

class EventService {
  private static instance: EventService;

  private constructor() {}

  static getInstance(): EventService {
    if (!EventService.instance) {
      EventService.instance = new EventService();
    }
    return EventService.instance;
  }

  /**
   * Log a new event
   */
  async logEvent(event: Partial<IEvent>): Promise<IEvent> {
    try {
      // Ensure DB connection
      if (!db.isConnectedToDatabase()) {
        await db.connect();
      }

      const newEvent = new Event({
        ...event,
        timestamp: event.timestamp || new Date(),
        status: event.status || 'pending'
      });

      await newEvent.save();

      // If this is a child event, update parent
      if (event.parentEventId) {
        await Event.findByIdAndUpdate(
          event.parentEventId,
          { $push: { childEvents: newEvent._id } }
        );
      }

      logger.debug(`Event logged: ${event.type} from ${event.source}`);
      return newEvent;

    } catch (error) {
      logger.error('Failed to log event:', error);
      throw error;
    }
  }

  /**
   * Update event status and metadata
   */
  async updateEvent(eventId: string, updates: Partial<IEvent>): Promise<IEvent | null> {
    try {
      // Ensure DB connection
      if (!db.isConnectedToDatabase()) {
        await db.connect();
      }

      // Try to find by correlationId first (for orchestrator events)
      // If not found, try by _id (for direct MongoDB IDs)
      let event = await Event.findOneAndUpdate(
        { correlationId: eventId },
        { $set: updates },
        { new: true }
      );

      if (!event) {
        logger.warn(`Event not found: ${eventId}`);
        return null;
      }

      logger.debug(`Event updated: ${eventId}`);
      return event;

    } catch (error) {
      logger.error('Failed to update event:', error);
      throw error;
    }
  }

  /**
   * Query events with filtering
   */
  async queryEvents(query: EventQuery): Promise<IEvent[]> {
    try {
      // Ensure DB connection
      if (!db.isConnectedToDatabase()) {
        await db.connect();
      }

      // Build MongoDB query
      const filter: any = {};

      if (query.type) {
        filter.type = Array.isArray(query.type) ? { $in: query.type } : query.type;
      }

      if (query.source) {
        filter.source = Array.isArray(query.source) ? { $in: query.source } : query.source;
      }

      if (query.status) {
        filter.status = Array.isArray(query.status) ? { $in: query.status } : query.status;
      }

      if (query.user) {
        filter.user = query.user;
      }

      if (query.correlationId) {
        filter.correlationId = query.correlationId;
      }

      if (query.startDate || query.endDate) {
        filter.timestamp = {};
        if (query.startDate) filter.timestamp.$gte = query.startDate;
        if (query.endDate) filter.timestamp.$lte = query.endDate;
      }

      // Execute query
      const events = await Event.find(filter)
        .sort(query.sort || { timestamp: -1 })
        .skip(query.offset || 0)
        .limit(query.limit || 100);

      return events;

    } catch (error) {
      logger.error('Failed to query events:', error);
      throw error;
    }
  }

  /**
   * Get event statistics
   */
  async getEventStats(startDate: Date = new Date(Date.now() - 86400000)): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySource: Record<string, number>;
    eventsByStatus: Record<string, number>;
    averageDuration: number;
    errorRate: number;
  }> {
    try {
      // Ensure DB connection
      if (!db.isConnectedToDatabase()) {
        await db.connect();
      }

      const pipeline = [
        { $match: { timestamp: { $gte: startDate } } },
        {
          $group: {
            _id: null,
            totalEvents: { $sum: 1 },
            totalErrors: {
              $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] }
            },
            averageDuration: { $avg: '$duration' },
            typeStats: { $push: '$type' },
            sourceStats: { $push: '$source' },
            statusStats: { $push: '$status' }
          }
        }
      ];

      const [stats] = await Event.aggregate(pipeline);

      if (!stats) {
        return {
          totalEvents: 0,
          eventsByType: {},
          eventsBySource: {},
          eventsByStatus: {},
          averageDuration: 0,
          errorRate: 0
        };
      }

      // Calculate distributions
      const eventsByType = stats.typeStats.reduce((acc: Record<string, number>, type: string) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      const eventsBySource = stats.sourceStats.reduce((acc: Record<string, number>, source: string) => {
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {});

      const eventsByStatus = stats.statusStats.reduce((acc: Record<string, number>, status: string) => {
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      return {
        totalEvents: stats.totalEvents,
        eventsByType,
        eventsBySource,
        eventsByStatus,
        averageDuration: Math.round(stats.averageDuration || 0),
        errorRate: stats.totalEvents ? stats.totalErrors / stats.totalEvents : 0
      };

    } catch (error) {
      logger.error('Failed to get event statistics:', error);
      throw error;
    }
  }

  /**
   * Delete old events
   */
  async cleanupOldEvents(maxAgeDays: number = 30): Promise<number> {
    try {
      // Ensure DB connection
      if (!db.isConnectedToDatabase()) {
        await db.connect();
      }

      const cutoffDate = new Date(Date.now() - maxAgeDays * 86400000);
      
      const result = await Event.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      logger.info(`Cleaned up ${result.deletedCount} old events`);
      return result.deletedCount || 0;

    } catch (error) {
      logger.error('Failed to cleanup old events:', error);
      throw error;
    }
  }
}

export const eventService = EventService.getInstance();