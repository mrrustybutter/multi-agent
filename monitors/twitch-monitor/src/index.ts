#!/usr/bin/env tsx

/**
 * Twitch Monitor - Bot + MCP Server
 * Acts as a normal Twitch bot while exposing MCP tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import tmi from 'tmi.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { createLogger } from '@rusty-butter/logger';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { initializeMemory, recallMonitorState, storeMonitorState, type MemoryClient } from '@rusty-butter/shared/memory-integration';

// Logger setup
const logger = createLogger('twitch-monitor');

// Types
interface ChatMessage {
  id: string;
  timestamp: string;
  username: string;
  displayName: string;
  message: string;
  subscriber: boolean;
  mod: boolean;
  vip: boolean;
}

interface BotConfig {
  channel: string;
  username?: string;
  oauth?: string;
  messageHistoryLimit: number;
  spawnCooldown: number;
  minMessageLength: number;
}

// Configuration
const config: BotConfig = {
  channel: process.env.TWITCH_CHANNEL || 'mrrustybutter',
  username: process.env.TWITCH_USERNAME,
  oauth: process.env.TWITCH_OAUTH,
  messageHistoryLimit: 100,
  spawnCooldown: 2000, // 2 seconds between Claude spawns
  minMessageLength: 3
};

// State
const messageHistory: ChatMessage[] = [];
const eventEmitter = new EventEmitter();
let twitchClient: tmi.Client | null = null;
let isConnected = false;
let lastSpawnTime = 0;
let memoryClient: MemoryClient | null = null;

// Bot functionality
async function connectToTwitch(): Promise<void> {
  const clientConfig: any = {
    options: { debug: false },
    connection: {
      secure: true,
      reconnect: true
    },
    channels: [config.channel]
  };

  // Add identity if we have credentials
  if (config.username && config.oauth) {
    clientConfig.identity = {
      username: config.username,
      password: config.oauth
    };
  }

  twitchClient = new tmi.Client(clientConfig);

  // Set up event handlers
  twitchClient.on('connected', () => {
    isConnected = true;
    logger.info(`Connected to Twitch channel: #${config.channel}`);
  });

  twitchClient.on('message', handleMessage);

  twitchClient.on('disconnected', () => {
    isConnected = false;
    logger.error('Disconnected from Twitch');
  });

  await twitchClient.connect();
}

async function handleMessage(
  channel: string, 
  tags: tmi.ChatUserstate, 
  message: string, 
  self: boolean
): Promise<void> {
  // Don't process our own messages
  if (self) return;

  const chatMessage: ChatMessage = {
    id: tags.id || `${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    username: tags.username || 'anonymous',
    displayName: tags['display-name'] || tags.username || 'Anonymous',
    message: message,
    subscriber: Boolean(tags.subscriber),
    mod: Boolean(tags.mod),
    vip: Boolean(tags.vip)
  };

  // Add to history
  messageHistory.push(chatMessage);
  if (messageHistory.length > config.messageHistoryLimit) {
    messageHistory.shift();
  }

  // Emit for MCP tools
  eventEmitter.emit('message', chatMessage);
  
  logger.info(`Chat: [${chatMessage.username}] ${message}`);

  // Check if we should spawn Claude
  if (shouldSpawnClaude(message)) {
    queueResponseAction(chatMessage);
  }

  // Handle bot commands
  if (message.startsWith('!')) {
    handleBotCommand(channel, chatMessage);
  }
}

function shouldSpawnClaude(message: string): boolean {
  // Skip short messages
  if (message.trim().length < config.minMessageLength) return false;
  
  // Check cooldown
  const now = Date.now();
  if (now - lastSpawnTime < config.spawnCooldown) return false;

  // Add more sophisticated logic here
  // For now, spawn for questions or mentions
  return message.includes('?') || 
         message.toLowerCase().includes('rusty') ||
         message.toLowerCase().includes('claude');
}

function queueResponseAction(message: ChatMessage): void {
  lastSpawnTime = Date.now();
  logger.info(`Queueing response for message from ${message.username}`);

  const queueDir = process.env.QUEUE_DIR || join(process.cwd(), '../queues');
  const queueMessage = {
    id: `twitch-${message.id}`,
    source: 'twitch-chat',
    priority: 2,
    timestamp: new Date().toISOString(),
    context: {
      channel: config.channel,
      user: message.username,
      displayName: message.displayName,
      message: message.message,
      subscriber: message.subscriber,
      mod: message.mod
    },
    action: {
      type: 'respond',
      content: `Respond to Twitch chat from ${message.username}: "${message.message}"`,
      data: {
        channelId: config.channel,
        replyTo: message.id
      }
    }
  };

  const filename = `twitch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`;
  const filepath = join(queueDir, filename);
  
  try {
    writeFileSync(filepath, JSON.stringify(queueMessage, null, 2));
    logger.info(`Queued response action: ${filename}`);
  } catch (error) {
    logger.error('Failed to queue response:', error);
  }
}

async function handleBotCommand(channel: string, message: ChatMessage): Promise<void> {
  const parts = message.message.split(' ');
  const command = parts[0].toLowerCase();

  switch (command) {
    case '!ping':
      await twitchClient?.say(channel, 'Pong! 🏓');
      break;
    case '!uptime':
      // Add uptime logic
      break;
    case '!commands':
      await twitchClient?.say(channel, 'Available commands: !ping, !uptime, !commands');
      break;
  }
}

// MCP Server
const server = new Server(
  {
    name: 'twitch-monitor',
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
      name: 'get_recent_messages',
      description: 'Get recent Twitch chat messages',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of messages (max 100)',
            default: 10
          },
          username: {
            type: 'string',
            description: 'Filter by username (optional)'
          }
        }
      }
    },
    {
      name: 'send_message',
      description: 'Send a message to Twitch chat',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Message to send'
          }
        },
        required: ['message']
      }
    },
    {
      name: 'get_bot_status',
      description: 'Get bot connection and statistics',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'wait_for_message',
      description: 'Wait for the next message matching criteria',
      inputSchema: {
        type: 'object',
        properties: {
          timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds',
            default: 30000
          },
          username: {
            type: 'string',
            description: 'Filter by username'
          },
          pattern: {
            type: 'string',
            description: 'Regex pattern to match'
          }
        }
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'get_recent_messages': {
      let messages = [...messageHistory];
      
      // Apply username filter if provided
      if (args?.username) {
        messages = messages.filter(m => 
          m.username.toLowerCase() === (args.username as string).toLowerCase()
        );
      }
      
      const limit = Math.min((args?.limit as number) || 10, 100);
      const recent = messages.slice(-limit);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(recent, null, 2)
        }]
      };
    }

    case 'send_message': {
      if (!isConnected || !twitchClient) {
        throw new Error('Not connected to Twitch');
      }
      
      const message = args?.message as string;
      await twitchClient.say(config.channel, message);
      
      return {
        content: [{
          type: 'text',
          text: `Message sent: ${message}`
        }]
      };
    }

    case 'get_bot_status': {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            connected: isConnected,
            channel: config.channel,
            messageCount: messageHistory.length,
            canSendMessages: Boolean(config.oauth),
            uptime: process.uptime()
          }, null, 2)
        }]
      };
    }

    case 'wait_for_message': {
      const timeoutMs = args?.timeoutMs || 30000;
      const username = args?.username as string | undefined;
      const pattern = args?.pattern as string | undefined;
      const regex = pattern ? new RegExp(pattern) : null;

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventEmitter.removeListener('message', handler);
          reject(new Error('Timeout waiting for message'));
        }, timeoutMs as number);

        const handler = (message: ChatMessage) => {
          if (username && message.username.toLowerCase() !== username.toLowerCase()) return;
          if (regex && !regex.test(message.message)) return;

          clearTimeout(timeout);
          eventEmitter.removeListener('message', handler);
          resolve({
            content: [{
              type: 'text',
              text: JSON.stringify(message, null, 2)
            }]
          });
        };

        eventEmitter.on('message', handler);
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Main startup
async function main() {
  logger.info('Starting Twitch Monitor (Bot + MCP Server)...');
  
  // Check for semantic memory MCP connection
  try {
    const { spawn } = await import('child_process');
    const memoryCheck = spawn('npx', ['-y', '@modelcontextprotocol/inspector', 'list'], {
      stdio: 'pipe'
    });
    
    memoryCheck.on('close', async (code) => {
      if (code === 0) {
        logger.info('Semantic memory available - recalling context...');
        // TODO: Implement memory recall on startup
        // const recentContext = await recallMemory('twitch-monitor', 10);
      }
    });
  } catch (error) {
    logger.warn('Could not check semantic memory:', error);
  }
  
  // Connect to Twitch
  await connectToTwitch();
  
  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  logger.info('Twitch Monitor ready!');
}

// Error handling
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  if (twitchClient) {
    twitchClient.disconnect();
  }
  process.exit(0);
});

// Start everything
main().catch((error) => {
  logger.error('Failed to start:', error);
  process.exit(1);
});