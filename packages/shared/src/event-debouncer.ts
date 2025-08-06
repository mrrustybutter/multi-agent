/**
 * Event Debouncer - Shared utility for batching monitor events
 * 
 * This debouncer accumulates events and sends them in batches to prevent
 * overwhelming the orchestrator during high-volume periods (like active chat).
 * 
 * Features:
 * - Debounce time: Wait period before sending accumulated events
 * - Max time: Maximum time to hold events before forcing a send
 * - Automatic batching: Groups similar events together
 * - Type-safe event handling
 */

export interface DebouncedEvent {
  id: string
  type: string
  source: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  data: any
  timestamp: string
  context?: any
}

export interface DebounceConfig {
  debounceTime: number  // Time to wait before sending (ms)
  maxTime: number      // Maximum time to hold events (ms)
  maxEvents?: number   // Maximum events per batch (default: 50)
}

export interface EventBatch {
  events: DebouncedEvent[]
  batchId: string
  totalEvents: number
  timespan: {
    start: string
    end: string
  }
  source: string
}

export class EventDebouncer {
  private events: DebouncedEvent[] = []
  private debounceTimer: NodeJS.Timeout | null = null
  private maxTimer: NodeJS.Timeout | null = null
  private firstEventTime: number | null = null
  private readonly config: Required<DebounceConfig>
  private readonly source: string
  private readonly onBatch: (batch: EventBatch) => void

  constructor(
    source: string,
    config: DebounceConfig,
    onBatch: (batch: EventBatch) => void
  ) {
    this.source = source
    this.config = {
      maxEvents: 50,
      ...config
    }
    this.onBatch = onBatch
  }

  /**
   * Add an event to the debouncer
   */
  addEvent(event: Omit<DebouncedEvent, 'id' | 'timestamp' | 'source'>): void {
    const debouncedEvent: DebouncedEvent = {
      ...event,
      id: `${this.source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      source: this.source
    }
    
    this.events.push(debouncedEvent)
    
    // Set first event time if this is the first event
    if (this.firstEventTime === null) {
      this.firstEventTime = Date.now()
      this.startMaxTimer()
    }
    
    // Reset debounce timer
    this.resetDebounceTimer()
    
    // Check if we've hit the max events limit
    if (this.events.length >= this.config.maxEvents) {
      this.sendBatch('max_events_reached')
    }
  }

  /**
   * Add multiple events at once (for chat messages, etc.)
   */
  addEvents(events: Array<Omit<DebouncedEvent, 'id' | 'timestamp' | 'source'>>): void {
    events.forEach(event => this.addEvent(event))
  }

  /**
   * Force send current batch immediately
   */
  flush(reason: string = 'manual_flush'): void {
    if (this.events.length > 0) {
      this.sendBatch(reason)
    }
  }

  /**
   * Get current batch info without sending
   */
  getCurrentBatch(): { eventCount: number; oldestEvent: string | null; newestEvent: string | null } {
    if (this.events.length === 0) {
      return { eventCount: 0, oldestEvent: null, newestEvent: null }
    }
    
    return {
      eventCount: this.events.length,
      oldestEvent: this.events[0].timestamp,
      newestEvent: this.events[this.events.length - 1].timestamp
    }
  }

  private resetDebounceTimer(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    
    this.debounceTimer = setTimeout(() => {
      this.sendBatch('debounce_timeout')
    }, this.config.debounceTime)
  }

  private startMaxTimer(): void {
    if (this.maxTimer) {
      clearTimeout(this.maxTimer)
    }
    
    this.maxTimer = setTimeout(() => {
      this.sendBatch('max_time_reached')
    }, this.config.maxTime)
  }

  private sendBatch(reason: string): void {
    if (this.events.length === 0) return
    
    const batch: EventBatch = {
      events: [...this.events],
      batchId: `batch-${this.source}-${Date.now()}`,
      totalEvents: this.events.length,
      timespan: {
        start: this.events[0].timestamp,
        end: this.events[this.events.length - 1].timestamp
      },
      source: this.source
    }
    
    // Clear timers and events
    this.clearTimers()
    this.events = []
    this.firstEventTime = null
    
    // Send batch
    try {
      this.onBatch(batch)
    } catch (error) {
      console.error(`EventDebouncer: Failed to send batch for ${this.source}:`, error)
    }
  }

  private clearTimers(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    
    if (this.maxTimer) {
      clearTimeout(this.maxTimer)
      this.maxTimer = null
    }
  }

  /**
   * Clean up timers (call when shutting down)
   */
  destroy(): void {
    this.clearTimers()
    this.events = []
    this.firstEventTime = null
  }
}

/**
 * Helper function to create common debouncer configurations
 */
export const DebouncePresets = {
  // For high-volume chat (Discord, Twitch)
  chat: {
    debounceTime: 10000,  // 10 seconds
    maxTime: 30000,       // 30 seconds max
    maxEvents: 25         // Max 25 chat messages per batch
  },
  
  // For social media (Twitter, Reddit)
  social: {
    debounceTime: 30000,  // 30 seconds
    maxTime: 120000,      // 2 minutes max
    maxEvents: 10         // Max 10 social events per batch
  },
  
  // For system events (less frequent, more important)
  system: {
    debounceTime: 5000,   // 5 seconds
    maxTime: 15000,       // 15 seconds max
    maxEvents: 5          // Max 5 system events per batch
  },
  
  // For critical events (minimal debouncing)
  critical: {
    debounceTime: 1000,   // 1 second
    maxTime: 3000,        // 3 seconds max
    maxEvents: 3          // Max 3 critical events per batch
  }
} as const