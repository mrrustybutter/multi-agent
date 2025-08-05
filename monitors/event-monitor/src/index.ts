#!/usr/bin/env tsx

/**
 * Event Monitor - System Events + MCP Server
 * Monitors system events, schedules, and triggers
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import cron from 'node-cron';
import { EventEmitter } from 'eventemitter3';
import { spawn } from 'child_process';
import { getMCPLogger, getAgentLogger } from '@rusty-butter/logger';

// Logger
const logger = getMCPLogger('event-monitor');
const agentLogger = getAgentLogger('event-monitor');

// Types
interface ScheduledEvent {
  id: string;
  name: string;
  schedule: string;
  action: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  task?: cron.ScheduledTask;
}

interface SystemEvent {
  id: string;
  timestamp: string;
  type: string;
  source: string;
  data: any;
}

// State
const eventEmitter = new EventEmitter();
const scheduledEvents: Map<string, ScheduledEvent> = new Map();
const eventHistory: SystemEvent[] = [];
const MAX_HISTORY = 1000;

// Default scheduled events
const defaultEvents: ScheduledEvent[] = [
  {
    id: 'hourly-check',
    name: 'Hourly System Check',
    schedule: '0 * * * *', // Every hour
    action: 'system-check',
    enabled: true
  },
  {
    id: 'stream-reminder',
    name: 'Stream Time Reminder',
    schedule: '0 20 * * *', // 8 PM daily
    action: 'stream-reminder',
    enabled: true
  },
  {
    id: 'memory-cleanup',
    name: 'Memory Cleanup',
    schedule: '0 0 * * *', // Midnight daily
    action: 'memory-cleanup',
    enabled: true
  }
];

// Initialize scheduled events
function initializeSchedules(): void {
  for (const event of defaultEvents) {
    scheduleEvent(event);
  }
  logger.toolCompleted('initializeSchedules', 0);
}

function scheduleEvent(event: ScheduledEvent): void {
  if (!event.enabled) return;

  const task = cron.schedule(event.schedule, () => {
    logger.toolCalled('scheduledEvent', { event: event.name });
    
    const systemEvent: SystemEvent = {
      id: `${event.id}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'scheduled',
      source: 'event-monitor',
      data: {
        eventId: event.id,
        eventName: event.name,
        action: event.action
      }
    };

    // Record event
    addToHistory(systemEvent);
    event.lastRun = systemEvent.timestamp;

    // Emit event
    eventEmitter.emit('scheduled-event', systemEvent);

    // Spawn Claude for specific actions
    if (shouldSpawnClaude(event.action)) {
      spawnClaudeForEvent(systemEvent);
    }
  }, {
    scheduled: false
  });

  event.task = task;
  task.start();
  
  scheduledEvents.set(event.id, event);
  logger.toolCompleted('scheduleEvent', 0);
}

function shouldSpawnClaude(action: string): boolean {
  const claudeActions = ['system-check', 'memory-cleanup', 'stream-reminder'];
  return claudeActions.includes(action);
}

function spawnClaudeForEvent(event: SystemEvent): void {
  const taskId = `event-${event.id}`;
  agentLogger.taskStarted(taskId, `Handle ${event.type} event`);

  const claudeProcess = spawn('claude', [
    'code',
    '--task',
    `Handle scheduled event: ${event.data.eventName} (${event.data.action})`
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      EVENT_MONITOR_URL: 'stdio://localhost',
      EVENT_CONTEXT: JSON.stringify(event)
    }
  });

  claudeProcess.on('exit', (code) => {
    if (code === 0) {
      agentLogger.taskCompleted(taskId, Date.now());
    } else {
      agentLogger.taskFailed(taskId, new Error(`Exit code ${code}`));
    }
  });
}

function addToHistory(event: SystemEvent): void {
  eventHistory.push(event);
  if (eventHistory.length > MAX_HISTORY) {
    eventHistory.shift();
  }
}

// MCP Server
const server = new Server(
  {
    name: 'event-monitor',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// MCP Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_scheduled_events',
      description: 'Get all scheduled events',
      inputSchema: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Filter by enabled status'
          }
        }
      }
    },
    {
      name: 'create_scheduled_event',
      description: 'Create a new scheduled event',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Event name'
          },
          schedule: {
            type: 'string',
            description: 'Cron schedule expression'
          },
          action: {
            type: 'string',
            description: 'Action to trigger'
          },
          enabled: {
            type: 'boolean',
            description: 'Enable immediately',
            default: true
          }
        },
        required: ['name', 'schedule', 'action']
      }
    },
    {
      name: 'toggle_scheduled_event',
      description: 'Enable or disable a scheduled event',
      inputSchema: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            description: 'Event ID'
          },
          enabled: {
            type: 'boolean',
            description: 'New enabled state'
          }
        },
        required: ['eventId', 'enabled']
      }
    },
    {
      name: 'trigger_event',
      description: 'Manually trigger an event',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Event type'
          },
          data: {
            type: 'object',
            description: 'Event data'
          }
        },
        required: ['type']
      }
    },
    {
      name: 'get_event_history',
      description: 'Get recent event history',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of events',
            default: 50
          },
          type: {
            type: 'string',
            description: 'Filter by event type'
          }
        }
      }
    },
    {
      name: 'wait_for_event',
      description: 'Wait for next event of type',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Event type to wait for'
          },
          timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds',
            default: 30000
          }
        },
        required: ['type']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();

  try {
    switch (name) {
      case 'get_scheduled_events': {
        const events = Array.from(scheduledEvents.values());
        const filtered = args?.enabled !== undefined
          ? events.filter(e => e.enabled === args.enabled)
          : events;
        
        logger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(filtered.map(e => ({
              ...e,
              task: undefined // Don't serialize the task object
            })), null, 2)
          }]
        };
      }

      case 'create_scheduled_event': {
        const event: ScheduledEvent = {
          id: `custom-${Date.now()}`,
          name: args?.name as string,
          schedule: args?.schedule as string,
          action: args?.action as string,
          enabled: args?.enabled !== false
        };

        scheduleEvent(event);
        
        logger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [{
            type: 'text',
            text: `Created scheduled event: ${event.id}`
          }]
        };
      }

      case 'toggle_scheduled_event': {
        const eventId = args?.eventId as string;
        const enabled = args?.enabled as boolean;
        const event = scheduledEvents.get(eventId);

        if (!event) {
          throw new Error(`Event not found: ${eventId}`);
        }

        event.enabled = enabled;
        if (enabled && !event.task) {
          scheduleEvent(event);
        } else if (!enabled && event.task) {
          event.task.stop();
          event.task = undefined;
        }

        logger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [{
            type: 'text',
            text: `Event ${eventId} ${enabled ? 'enabled' : 'disabled'}`
          }]
        };
      }

      case 'trigger_event': {
        const systemEvent: SystemEvent = {
          id: `manual-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: args?.type as string,
          source: 'manual',
          data: args?.data || {}
        };

        addToHistory(systemEvent);
        eventEmitter.emit(systemEvent.type, systemEvent);

        if (shouldSpawnClaude(systemEvent.type)) {
          spawnClaudeForEvent(systemEvent);
        }

        logger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [{
            type: 'text',
            text: `Triggered event: ${systemEvent.type}`
          }]
        };
      }

      case 'get_event_history': {
        let events = [...eventHistory];
        
        if (args?.type) {
          events = events.filter(e => e.type === args.type);
        }
        
        const limit = Math.min((args?.limit as number) || 50, events.length);
        const recent = events.slice(-limit);
        
        logger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(recent, null, 2)
          }]
        };
      }

      case 'wait_for_event': {
        const eventType = args?.type as string;
        const timeoutMs = args?.timeoutMs || 30000;

        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            eventEmitter.off(eventType, handler);
            reject(new Error(`Timeout waiting for event: ${eventType}`));
          }, timeoutMs as number);

          const handler = (event: SystemEvent) => {
            clearTimeout(timeout);
            logger.toolCompleted(name, Date.now() - startTime);
            resolve({
              content: [{
                type: 'text',
                text: JSON.stringify(event, null, 2)
              }]
            });
          };

          eventEmitter.once(eventType, handler);
        });
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.toolError(name, error as Error);
    throw error;
  }
});

// Main startup
async function main() {
  logger.connected({ service: 'event-monitor' });
  
  // Initialize schedules
  initializeSchedules();
  
  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  logger.connected({ status: 'ready', scheduledEvents: scheduledEvents.size });
}

// Error handling
process.on('unhandledRejection', (error) => {
  logger.toolError('unhandledRejection', error as Error);
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.disconnected('SIGINT');
  
  // Stop all scheduled tasks
  for (const event of scheduledEvents.values()) {
    if (event.task) {
      event.task.stop();
    }
  }
  
  process.exit(0);
});

// Start everything
main().catch((error) => {
  logger.toolError('startup', error);
  process.exit(1);
});