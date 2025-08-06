#!/usr/bin/env tsx

/**
 * Discord Monitor - Modularized version
 * Discord bot with MCP server integration and event forwarding
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import winston from 'winston';

// Import modular services
import { DiscordBot } from './services/DiscordBot.js';
import { EventForwarder } from './services/EventForwarder.js';
import { MCPToolHandler } from './services/MCPToolHandler.js';
import { ConfigManager } from './services/ConfigManager.js';

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'discord-monitor' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Initialize services
const configManager = new ConfigManager();
let discordBot: DiscordBot;
let eventForwarder: EventForwarder;
let toolHandler: MCPToolHandler;

// MCP Server setup
const server = new Server(
  {
    name: 'discord-monitor',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const tools = [
  {
    name: 'send_message',
    description: 'Send a message to a Discord channel',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { 
          type: 'string', 
          description: 'Discord channel ID' 
        },
        content: { 
          type: 'string', 
          description: 'Message content to send' 
        }
      },
      required: ['channelId', 'content']
    }
  },
  {
    name: 'join_voice',
    description: 'Join a Discord voice channel',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { 
          type: 'string', 
          description: 'Voice channel ID' 
        },
        guildId: { 
          type: 'string', 
          description: 'Guild ID (optional, uses default if not provided)' 
        }
      },
      required: ['channelId']
    }
  },
  {
    name: 'leave_voice',
    description: 'Leave the current voice channel',
    inputSchema: {
      type: 'object',
      properties: {
        guildId: { 
          type: 'string', 
          description: 'Guild ID (optional, uses default if not provided)' 
        }
      }
    }
  },
  {
    name: 'get_messages',
    description: 'Get recent message history',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_channels',
    description: 'List channels in a guild',
    inputSchema: {
      type: 'object',
      properties: {
        guildId: { 
          type: 'string', 
          description: 'Guild ID (optional, uses default if not provided)' 
        }
      }
    }
  },
  {
    name: 'get_status',
    description: 'Get Discord bot status',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Register MCP handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (!toolHandler) {
    throw new Error('Discord bot not initialized');
  }
  
  try {
    let result;
    
    switch (name) {
      case 'send_message':
        result = await toolHandler.handleSendMessage(args);
        break;
      case 'join_voice':
        result = await toolHandler.handleJoinVoice(args);
        break;
      case 'leave_voice':
        result = await toolHandler.handleLeaveVoice(args);
        break;
      case 'get_messages':
        result = await toolHandler.handleGetMessages();
        break;
      case 'list_channels':
        result = await toolHandler.handleListChannels(args);
        break;
      case 'get_status':
        result = await toolHandler.handleGetStatus();
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    
    return result;
  } catch (error: any) {
    logger.error(`Tool ${name} failed:`, error);
    
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }]
    };
  }
});

// Initialize Discord bot and services
async function initializeServices() {
  // Load configuration
  await configManager.initialize();
  const config = configManager.getConfig();
  
  if (!config.token) {
    throw new Error('Discord token not configured. Set DISCORD_TOKEN environment variable.');
  }
  
  // Create bot instance
  discordBot = new DiscordBot(configManager.getBotConfig());
  
  // Create event forwarder
  eventForwarder = new EventForwarder(configManager.getForwarderConfig());
  
  // Create tool handler
  toolHandler = new MCPToolHandler(discordBot);
  
  // Set up event handlers
  discordBot.on('message', async (message) => {
    logger.info(`Message from ${message.author.username}: ${message.content.substring(0, 50)}...`);
    
    // Forward to orchestrator
    try {
      await eventForwarder.forwardMessage(message);
    } catch (error) {
      logger.error('Failed to forward message:', error);
    }
  });
  
  discordBot.on('ready', (user) => {
    logger.info(`Discord bot ready as ${user?.tag}`);
  });
  
  discordBot.on('error', (error) => {
    logger.error('Discord bot error:', error);
  });
  
  // Handle config updates
  configManager.on('configUpdated', (newConfig, oldConfig) => {
    logger.info('Configuration updated, applying changes...');
    
    // Update forwarder config
    eventForwarder.updateConfig(configManager.getForwarderConfig());
    
    // If token changed, we need to reconnect
    if (newConfig.token !== oldConfig.token) {
      logger.info('Token changed, reconnecting bot...');
      reconnectBot();
    }
  });
  
  // Connect to Discord
  await discordBot.connect();
  logger.info('Discord bot connected successfully');
}

// Reconnect bot with new configuration
async function reconnectBot() {
  try {
    await discordBot.disconnect();
    discordBot = new DiscordBot(configManager.getBotConfig());
    await discordBot.connect();
    toolHandler = new MCPToolHandler(discordBot);
    logger.info('Discord bot reconnected with new configuration');
  } catch (error) {
    logger.error('Failed to reconnect Discord bot:', error);
  }
}

// Main function
async function main() {
  try {
    // Initialize services
    await initializeServices();
    
    // Start MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    logger.info('Discord monitor MCP server started');
  } catch (error) {
    logger.error('Failed to start Discord monitor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  
  if (discordBot) {
    await discordBot.disconnect();
  }
  
  configManager.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  
  if (discordBot) {
    await discordBot.disconnect();
  }
  
  configManager.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the monitor
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});