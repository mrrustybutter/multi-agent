#!/usr/bin/env tsx

/**
 * Discord Monitor - Bot + MCP Server
 * Acts as a Discord bot while exposing MCP tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Client, GatewayIntentBits, Message, VoiceChannel } from 'discord.js';
import { joinVoiceChannel, VoiceConnection } from '@discordjs/voice';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import winston from 'winston';
import { getMonitorConfig, watchConfig } from '@rusty-butter/shared';

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Types
interface DiscordMessage {
  id: string;
  timestamp: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
    bot: boolean;
  };
  content: string;
  channelId: string;
  channelName: string;
  guildId: string;
  guildName: string;
}

interface BotConfig {
  token: string;
  defaultGuild?: string;
  messageHistoryLimit: number;
  spawnCooldown: number;
  minMessageLength: number;
}

// Configuration - will be populated from MongoDB or env
let config: BotConfig = {
  token: '',
  defaultGuild: undefined,
  messageHistoryLimit: 100,
  spawnCooldown: 2000,
  minMessageLength: 3
};

// State
const messageHistory: DiscordMessage[] = [];
const eventEmitter = new EventEmitter();
let discordClient: Client | null = null;
let currentVoiceConnection: VoiceConnection | null = null;
let isConnected = false;
let lastSpawnTime = 0;

// Bot functionality
async function connectToDiscord(): Promise<void> {
  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates
    ]
  });

  discordClient.on('ready', () => {
    isConnected = true;
    logger.info(`Discord bot logged in as ${discordClient?.user?.tag}`);
  });

  discordClient.on('messageCreate', handleMessage);

  discordClient.on('error', (error) => {
    logger.error('Discord error:', error);
  });

  await discordClient.login(config.token);
}

async function handleMessage(message: Message): Promise<void> {
  // Don't process bot messages
  if (message.author.bot) return;

  const discordMessage: DiscordMessage = {
    id: message.id,
    timestamp: message.createdAt.toISOString(),
    author: {
      id: message.author.id,
      username: message.author.username,
      discriminator: message.author.discriminator,
      bot: message.author.bot
    },
    content: message.content,
    channelId: message.channel.id,
    channelName: 'name' in message.channel ? (message.channel.name || 'Unknown') : 'DM',
    guildId: message.guild?.id || '',
    guildName: message.guild?.name || 'DM'
  };

  // Add to history
  messageHistory.push(discordMessage);
  if (messageHistory.length > config.messageHistoryLimit) {
    messageHistory.shift();
  }

  // Emit for MCP tools
  eventEmitter.emit('message', discordMessage);
  
  logger.info(`Discord: [${discordMessage.author.username}] ${message.content}`);

  // Check if we should spawn Claude
  if (shouldSpawnClaude(message)) {
    spawnClaudeAgent(discordMessage);
  }

  // Handle bot commands
  if (message.content.startsWith('!')) {
    handleBotCommand(message);
  }
}

function shouldSpawnClaude(message: Message): boolean {
  // Skip short messages
  if (message.content.trim().length < config.minMessageLength) return false;
  
  // Check cooldown
  const now = Date.now();
  if (now - lastSpawnTime < config.spawnCooldown) return false;

  // Spawn for mentions, questions, or keywords
  return message.mentions.has(discordClient!.user!) ||
         message.content.includes('?') ||
         message.content.toLowerCase().includes('rusty') ||
         message.content.toLowerCase().includes('claude');
}

function spawnClaudeAgent(message: DiscordMessage): void {
  lastSpawnTime = Date.now();
  logger.info(`Spawning Claude agent for Discord message from ${message.author.username}`);

  const claudeProcess = spawn('claude', [
    'code',
    '--task',
    `Respond to Discord message from ${message.author.username} in #${message.channelName}: "${message.content}"`
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DISCORD_MONITOR_URL: 'stdio://localhost',
      CONTEXT: JSON.stringify(message)
    }
  });

  claudeProcess.on('exit', (code) => {
    logger.info(`Claude agent exited with code ${code}`);
  });
}

async function handleBotCommand(message: Message): Promise<void> {
  const parts = message.content.split(' ');
  const command = parts[0].toLowerCase();

  switch (command) {
    case '!ping':
      await message.reply('Pong! 🏓');
      break;
    case '!status':
      await message.reply(`Connected and monitoring. ${messageHistory.length} messages in history.`);
      break;
    case '!help':
      await message.reply('Commands: !ping, !status, !help');
      break;
  }
}

// MCP Server
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

// MCP Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_recent_messages',
      description: 'Get recent Discord messages',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of messages (max 100)',
            default: 10
          },
          channelId: {
            type: 'string',
            description: 'Filter by channel ID'
          },
          username: {
            type: 'string',
            description: 'Filter by username'
          }
        }
      }
    },
    {
      name: 'send_message',
      description: 'Send a message to a Discord channel',
      inputSchema: {
        type: 'object',
        properties: {
          channelId: {
            type: 'string',
            description: 'Channel ID to send to'
          },
          message: {
            type: 'string',
            description: 'Message to send'
          }
        },
        required: ['channelId', 'message']
      }
    },
    {
      name: 'join_voice_channel',
      description: 'Join a voice channel',
      inputSchema: {
        type: 'object',
        properties: {
          channelId: {
            type: 'string',
            description: 'Voice channel ID'
          }
        },
        required: ['channelId']
      }
    },
    {
      name: 'leave_voice_channel',
      description: 'Leave current voice channel',
      inputSchema: {
        type: 'object',
        properties: {}
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
      description: 'Wait for next message matching criteria',
      inputSchema: {
        type: 'object',
        properties: {
          timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds',
            default: 30000
          },
          channelId: {
            type: 'string',
            description: 'Filter by channel'
          },
          username: {
            type: 'string',
            description: 'Filter by username'
          },
          pattern: {
            type: 'string',
            description: 'Regex pattern'
          }
        }
      }
    },
    {
      name: 'create_channel',
      description: 'Create a new text or voice channel',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Channel name'
          },
          type: {
            type: 'string',
            enum: ['text', 'voice'],
            description: 'Channel type',
            default: 'text'
          },
          category: {
            type: 'string',
            description: 'Category name to create channel in'
          }
        },
        required: ['name']
      }
    },
    {
      name: 'upload_file',
      description: 'Upload a file to Discord channel',
      inputSchema: {
        type: 'object',
        properties: {
          channelId: {
            type: 'string',
            description: 'Channel ID to upload to'
          },
          filePath: {
            type: 'string',
            description: 'Path to file to upload'
          },
          message: {
            type: 'string',
            description: 'Optional message with file'
          }
        },
        required: ['channelId', 'filePath']
      }
    },
    {
      name: 'list_channels',
      description: 'List all channels in the current server',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['text', 'voice', 'all'],
            description: 'Filter by channel type',
            default: 'all'
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
      
      if (args?.channelId) {
        messages = messages.filter(m => m.channelId === args.channelId);
      }
      
      if (args?.username) {
        messages = messages.filter(m => 
          m.author.username.toLowerCase() === (args.username as string).toLowerCase()
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
      if (!isConnected || !discordClient) {
        throw new Error('Not connected to Discord');
      }
      
      const channelId = args?.channelId as string;
      const message = args?.message as string;
      
      const channel = await discordClient.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error('Invalid text channel');
      }
      
      if ('send' in channel) {
        await channel.send(message);
      } else {
        throw new Error('Channel does not support sending messages');
      }
      
      return {
        content: [{
          type: 'text',
          text: `Message sent to channel ${channelId}`
        }]
      };
    }

    case 'join_voice_channel': {
      if (!isConnected || !discordClient) {
        throw new Error('Not connected to Discord');
      }
      
      const channelId = args?.channelId as string;
      const channel = await discordClient.channels.fetch(channelId);
      
      if (!channel || !(channel instanceof VoiceChannel)) {
        throw new Error('Invalid voice channel');
      }
      
      currentVoiceConnection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator as any,
      });
      
      return {
        content: [{
          type: 'text',
          text: `Joined voice channel: ${channel.name}`
        }]
      };
    }

    case 'leave_voice_channel': {
      if (currentVoiceConnection) {
        currentVoiceConnection.destroy();
        currentVoiceConnection = null;
      }
      
      return {
        content: [{
          type: 'text',
          text: 'Left voice channel'
        }]
      };
    }

    case 'create_channel': {
      if (!isConnected || !discordClient) {
        throw new Error('Not connected to Discord');
      }

      const name = args?.name as string;
      const type = args?.type as string || 'text';
      const categoryName = args?.category as string | undefined;
      
      // Get the first available guild
      const guild = discordClient.guilds.cache.first();
      if (!guild) {
        throw new Error('No guild available');
      }

      // Find category if specified
      let parent = undefined;
      if (categoryName) {
        parent = guild.channels.cache.find(
          c => c.type === 4 && c.name.toLowerCase() === categoryName.toLowerCase()
        );
      }

      const channel = await guild.channels.create({
        name,
        type: type === 'voice' ? 2 : 0,
        parent: parent?.id
      });

      return {
        content: [{
          type: 'text',
          text: `Created ${type} channel: ${channel.name} (${channel.id})`
        }]
      };
    }

    case 'upload_file': {
      if (!isConnected || !discordClient) {
        throw new Error('Not connected to Discord');
      }

      const channelId = args?.channelId as string;
      const filePath = args?.filePath as string;
      const message = args?.message as string | undefined;

      const channel = await discordClient.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error('Invalid text channel');
      }

      if ('send' in channel) {
        await channel.send({
          content: message || '',
          files: [filePath]
        });
      } else {
        throw new Error('Channel does not support sending messages');
      }

      return {
        content: [{
          type: 'text',
          text: `File uploaded to channel ${channelId}`
        }]
      };
    }

    case 'list_channels': {
      if (!isConnected || !discordClient) {
        throw new Error('Not connected to Discord');
      }

      const filterType = args?.type as string || 'all';
      const guild = discordClient.guilds.cache.first();
      
      if (!guild) {
        throw new Error('No guild available');
      }

      const channels = guild.channels.cache
        .filter(channel => {
          if (filterType === 'text') return channel.type === 0;
          if (filterType === 'voice') return channel.type === 2;
          return channel.type === 0 || channel.type === 2;
        })
        .map(channel => ({
          id: channel.id,
          name: channel.name,
          type: channel.type === 0 ? 'text' : 'voice',
          parent: channel.parent?.name || 'No Category'
        }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(channels, null, 2)
        }]
      };
    }

    case 'get_bot_status': {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            connected: isConnected,
            username: discordClient?.user?.username,
            guilds: discordClient?.guilds.cache.size,
            messageCount: messageHistory.length,
            inVoice: currentVoiceConnection !== null,
            uptime: process.uptime()
          }, null, 2)
        }]
      };
    }

    case 'wait_for_message': {
      const timeoutMs = args?.timeoutMs || 30000;
      const channelId = args?.channelId as string | undefined;
      const username = args?.username as string | undefined;
      const pattern = args?.pattern as string | undefined;
      const regex = pattern ? new RegExp(pattern) : null;

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventEmitter.removeListener('message', handler);
          reject(new Error('Timeout waiting for message'));
        }, timeoutMs as number);

        const handler = (message: DiscordMessage) => {
          if (channelId && message.channelId !== channelId) return;
          if (username && message.author.username.toLowerCase() !== username.toLowerCase()) return;
          if (regex && !regex.test(message.content)) return;

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
  logger.info('Starting Discord Monitor (Bot + MCP Server)...');
  
  // Load configuration from MongoDB or fallback to env
  logger.info('Loading configuration...');
  const monitorConfig = await getMonitorConfig();
  
  if (!monitorConfig.discord?.token) {
    logger.error('Discord token not found in configuration or environment');
    throw new Error('Discord token required - check MongoDB config or DISCORD_TOKEN env var');
  }
  
  // Update config with values from MongoDB
  config.token = monitorConfig.discord.token;
  config.defaultGuild = monitorConfig.discord.guildId || config.defaultGuild;
  
  logger.info(`Discord config loaded - Guild: ${config.defaultGuild || 'not set'}`);
  
  // Watch for config changes
  watchConfig((newConfig) => {
    if (newConfig.discord?.token && newConfig.discord.token !== config.token) {
      logger.info('Discord token changed, reconnecting...');
      config.token = newConfig.discord.token;
      config.defaultGuild = newConfig.discord.guildId || config.defaultGuild;
      // TODO: Reconnect Discord client with new token
    }
  });
  
  // Connect to Discord
  await connectToDiscord();
  
  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  logger.info('Discord Monitor ready!');
}

// Error handling
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  if (discordClient) {
    discordClient.destroy();
  }
  process.exit(0);
});

// Start everything
main().catch((error) => {
  logger.error('Failed to start:', error);
  process.exit(1);
});