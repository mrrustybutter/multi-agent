/**
 * Event type definitions for the multi-agent system
 */

export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type EventStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface Event {
  id: string;
  source: string;
  type: string;
  priority: Priority;
  timestamp: Date;
  data?: {
    message?: string;
    text?: string;
    user?: string;
    username?: string;
    channel?: string;
    requiresVoice?: boolean;
    [key: string]: any;
  };
  context?: {
    [key: string]: any;
  };
  requiredTools?: string[];
  status?: EventStatus;
  response?: string;
  error?: string;
  duration?: number;
  completedAt?: Date;
  memoryIds?: string[];
  metadata?: {
    [key: string]: any;
  };
}

export interface QueuedEvent {
  event: Event;
  retries: number;
  maxRetries: number;
  lastError?: Error;
}