import PQueue from 'p-queue';
import { Event } from '../../types';

interface QueuedEvent extends Event {
  retryCount: number;
  queuedAt: Date;
}
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('queue-manager');

export class QueueManager {
  private eventQueue: PQueue;
  private voiceQueue: PQueue;
  private retryQueue: Map<string, QueuedEvent> = new Map();

  constructor(
    maxConcurrency: number = 5,
    voiceQueueConcurrency: number = 1
  ) {
    this.eventQueue = new PQueue({ concurrency: maxConcurrency });
    this.voiceQueue = new PQueue({ concurrency: voiceQueueConcurrency });
  }

  updateConfig(maxConcurrency: number, voiceQueueConcurrency: number) {
    this.eventQueue = new PQueue({ concurrency: maxConcurrency });
    this.voiceQueue = new PQueue({ concurrency: voiceQueueConcurrency });
  }

  async queueEvent(event: Event, isVoice: boolean, processor: (event: Event) => Promise<void>): Promise<void> {
    const queue = isVoice ? this.voiceQueue : this.eventQueue;
    const queuedEvent: QueuedEvent = {
      ...event,
      retryCount: 0,
      queuedAt: new Date()
    };

    logger.info(`📥 Queueing event ${event.id} to ${isVoice ? 'voice' : 'event'} queue (current size: ${queue.size})`);
    
    await queue.add(async () => {
      try {
        await processor(event);
      } catch (error) {
        logger.error(`Failed to process event ${event.id}:`, error);
        this.addToRetryQueue(queuedEvent);
      }
    });
  }

  addToRetryQueue(event: QueuedEvent) {
    if (event.retryCount < 3) {
      event.retryCount++;
      this.retryQueue.set(event.id, event);
      logger.info(`🔄 Added event ${event.id} to retry queue (attempt ${event.retryCount}/3)`);
    } else {
      logger.error(`❌ Event ${event.id} exceeded max retries`);
    }
  }

  async processRetryQueue(processor: (event: Event) => Promise<void>) {
    const retryEvents = Array.from(this.retryQueue.values());
    for (const event of retryEvents) {
      this.retryQueue.delete(event.id);
      await this.queueEvent(event, false, processor);
    }
  }

  getStatus() {
    return {
      eventQueue: {
        size: this.eventQueue.size,
        pending: this.eventQueue.pending
      },
      voiceQueue: {
        size: this.voiceQueue.size,
        pending: this.voiceQueue.pending
      },
      retryQueue: this.retryQueue.size
    };
  }

  clear() {
    this.eventQueue.clear();
    this.voiceQueue.clear();
    this.retryQueue.clear();
  }
}