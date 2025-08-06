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
import { getMonitorConfig, watchConfig } from '@rusty-butter/shared';

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

// Configuration - will be populated from MongoDB or env
let config: BotConfig = {
  channel: 'mrrustybutter',
  username: undefined,
  oauth: undefined,
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
  
  // Also skip messages from the bot account to prevent loops
  const username = tags.username || 'anonymous';
  if (username.toLowerCase() === 'mrrustybutter') return;

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

  // More inclusive triggers - process most meaningful messages
  const lowerMessage = message.toLowerCase();
  
  // Trigger on questions, greetings, requests, or key words
  return message.includes('?') || 
         lowerMessage.includes('rusty') ||
         lowerMessage.includes('claude') ||
         lowerMessage.includes('hello') ||
         lowerMessage.includes('hey') ||
         lowerMessage.includes('help') ||
         lowerMessage.includes('tell') ||
         lowerMessage.includes('what') ||
         lowerMessage.includes('how') ||
         lowerMessage.includes('speak') ||
         lowerMessage.includes('joke') ||
         message.length > 20; // Any longer message should trigger a response
}

async function queueResponseAction(message: ChatMessage): Promise<void> {
  lastSpawnTime = Date.now();
  logger.info(`Sending event to orchestrator for message from ${message.username}`);

  const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'http://localhost:8742';
  
  const event = {
    source: 'twitch',
    type: 'chat_message',
    priority: message.subscriber || message.mod || message.vip ? 'high' : 'medium',
    data: {
      channel: config.channel,
      user: message.username,
      displayName: message.displayName,
      message: message.message,
      subscriber: message.subscriber,
      mod: message.mod,
      vip: message.vip,
      messageId: message.id
    },
    context: {
      recentMessages: messageHistory.slice(-10),
      description: `Twitch chat message from ${message.displayName}: "${message.message}"`
    },
    requiredTools: ['twitch-chat', 'elevenlabs', 'rustybutter-avatar', 'semantic-memory']
  };

  try {
    const response = await fetch(`${orchestratorUrl}/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json() as { eventId: string };
    logger.info(`Event sent to orchestrator: ${result.eventId}`);
  } catch (error) {
    logger.error('Failed to send event to orchestrator:', error);
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
  
  // Load configuration from MongoDB or fallback to env
  logger.info('Loading configuration...');
  const monitorConfig = await getMonitorConfig();
  
  if (monitorConfig.twitch) {
    config.channel = monitorConfig.twitch.channel || config.channel;
    config.username = monitorConfig.twitch.username;
    config.oauth = monitorConfig.twitch.oauth;
    logger.info(`Twitch config loaded - Channel: ${config.channel}, Username: ${config.username || 'not set'}`);
  } else {
    logger.warn('No Twitch config found in MongoDB, using environment variables');
    config.username = process.env.TWITCH_USERNAME;
    config.oauth = process.env.TWITCH_OAUTH;
    config.channel = process.env.TWITCH_CHANNEL || config.channel;
  }
  
  // Watch for config changes
  watchConfig((newConfig) => {
    if (newConfig.twitch) {
      const changed = newConfig.twitch.oauth !== config.oauth || 
                     newConfig.twitch.username !== config.username ||
                     newConfig.twitch.channel !== config.channel;
      
      if (changed) {
        logger.info('Twitch config changed, reconnecting...');
        config.channel = newConfig.twitch.channel || config.channel;
        config.username = newConfig.twitch.username;
        config.oauth = newConfig.twitch.oauth;
        // TODO: Reconnect Twitch client with new credentials
      }
    }
  });
  
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