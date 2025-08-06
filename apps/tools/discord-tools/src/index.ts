#!/usr/bin/env tsx

/**
 * Discord Tools MCP Server - Shared Discord functionality with SSE
 * Provides Discord operations for any Claude instance
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Client, GatewayIntentBits, TextChannel, VoiceChannel } from 'discord.js';
import { joinVoiceChannel, VoiceConnection, getVoiceConnection } from '@discordjs/voice';
import express from 'express';
import { createLogger } from '@rusty-butter/logger';
import { getPort } from '@rusty-butter/shared';

// Logger setup
const logger = createLogger('discord-tools');

// Types
interface DiscordSession {
  id: string;
  client: Client;
  voiceConnection?: VoiceConnection;
  currentGuildId?: string;
  currentChannelId?: string;
  createdAt: Date;
  lastUsed: Date;
}

// Configuration
const config = {
  port: getPort('discord-tools'),
  sessionTimeout: 60 * 60 * 1000, // 1 hour
  maxSessions: 5
};

// State
const sessions = new Map<string, DiscordSession>();
let sseClients = new Set<express.Response>();

// Express app for SSE
const app = express();
app.use(express.json());

// SSE endpoint
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  sseClients.add(res);
  logger.info('SSE client connected');

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ 
    type: 'connected', 
    sessions: Array.from(sessions.keys()),
    timestamp: new Date().toISOString()
  })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
    logger.info('SSE client disconnected');
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'discord-tools',
    activeSessions: sessions.size,
    sseClients: sseClients.size,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Broadcast to all SSE clients
function broadcast(event: any) {
  const data = `data: ${JSON.stringify({
    ...event,
    timestamp: new Date().toISOString()
  })}\n\n`;
  sseClients.forEach(client => client.write(data));
}

// Create new Discord session
async function createSession(token: string): Promise<DiscordSession> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.DirectMessages
    ]
  });

  const sessionId = `discord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const session: DiscordSession = {
    id: sessionId,
    client,
    createdAt: new Date(),
    lastUsed: new Date()
  };

  // Set up event handlers
  client.on('ready', () => {
    logger.info(`Discord session ${sessionId} ready as ${client.user?.tag}`);
    broadcast({
      type: 'session_ready',
      sessionId,
      username: client.user?.username,
      guilds: client.guilds.cache.size
    });
  });

  client.on('messageCreate', (message) => {
    broadcast({
      type: 'message',
      sessionId,
      channelId: message.channel.id,
      author: message.author.username,
      content: message.content,
      timestamp: message.createdAt
    });
  });

  client.on('error', (error) => {
    logger.error(`Discord session ${sessionId} error:`, error);
    broadcast({
      type: 'error',
      sessionId,
      error: error.message
    });
  });

  await client.login(token);
  sessions.set(sessionId, session);
  
  return session;
}

// Get or create session
async function getSession(sessionId?: string, token?: string): Promise<DiscordSession> {
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.lastUsed = new Date();
    return session;
  }

  if (!token) {
    throw new Error('Token required for new session');
  }

  return createSession(token);
}

// Clean up old sessions
async function cleanupSessions() {
  const now = Date.now();
  
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastUsed.getTime() > config.sessionTimeout) {
      if (session.voiceConnection) {
        session.voiceConnection.destroy();
      }
      await session.client.destroy();
      sessions.delete(id);
      broadcast({ type: 'session_closed', sessionId: id });
      logger.info(`Session cleaned up: ${id}`);
    }
  }
}

// MCP Server
const server = new Server(
  {
    name: 'discord-tools',
    version: '0.1.0',
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
      name: 'discord_send_message',
      description: 'Send a message to a Discord channel',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          channelId: { type: 'string', description: 'Channel ID' },
          message: { type: 'string', description: 'Message to send' },
          token: { type: 'string', description: 'Bot token (for new session)' }
        },
        required: ['channelId', 'message']
      }
    },
    {
      name: 'discord_join_voice',
      description: 'Join a Discord voice channel',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          channelId: { type: 'string', description: 'Voice channel ID' },
          token: { type: 'string', description: 'Bot token (for new session)' }
        },
        required: ['channelId']
      }
    },
    {
      name: 'discord_leave_voice',
      description: 'Leave current voice channel',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'discord_list_guilds',
      description: 'List all guilds the bot is in',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          token: { type: 'string', description: 'Bot token (for new session)' }
        }
      }
    },
    {
      name: 'discord_list_channels',
      description: 'List channels in a guild',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          guildId: { type: 'string', description: 'Guild ID' },
          token: { type: 'string', description: 'Bot token (for new session)' }
        },
        required: ['guildId']
      }
    },
    {
      name: 'discord_create_channel',
      description: 'Create a new channel',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          guildId: { type: 'string', description: 'Guild ID' },
          name: { type: 'string', description: 'Channel name' },
          type: { type: 'string', enum: ['text', 'voice'], default: 'text' },
          category: { type: 'string', description: 'Category name' },
          token: { type: 'string', description: 'Bot token (for new session)' }
        },
        required: ['guildId', 'name']
      }
    },
    {
      name: 'discord_upload_file',
      description: 'Upload a file to a channel',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          channelId: { type: 'string', description: 'Channel ID' },
          filePath: { type: 'string', description: 'File path' },
          message: { type: 'string', description: 'Optional message' },
          token: { type: 'string', description: 'Bot token (for new session)' }
        },
        required: ['channelId', 'filePath']
      }
    },
    {
      name: 'discord_get_sessions',
      description: 'List all active Discord sessions',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'discord_send_message': {
        const session = await getSession(args?.sessionId as string, args?.token as string);
        const channelId = args?.channelId as string;
        const message = args?.message as string;

        const channel = await session.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          throw new Error('Invalid text channel');
        }

        const sent = await (channel as TextChannel).send(message);
        
        broadcast({
          type: 'message_sent',
          sessionId: session.id,
          channelId,
          messageId: sent.id
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              sessionId: session.id,
              messageId: sent.id,
              channelId
            })
          }]
        };
      }

      case 'discord_join_voice': {
        const session = await getSession(args?.sessionId as string, args?.token as string);
        const channelId = args?.channelId as string;

        const channel = await session.client.channels.fetch(channelId);
        if (!channel || channel.type !== 2) {
          throw new Error('Invalid voice channel');
        }

        const voiceChannel = channel as VoiceChannel;
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        session.voiceConnection = connection;
        
        broadcast({
          type: 'voice_joined',
          sessionId: session.id,
          channelId,
          guildId: voiceChannel.guild.id
        });

        return {
          content: [{
            type: 'text',
            text: `Joined voice channel: ${voiceChannel.name}`
          }]
        };
      }

      case 'discord_leave_voice': {
        const session = sessions.get(args?.sessionId as string);
        if (!session) {
          throw new Error('Session not found');
        }

        if (session.voiceConnection) {
          session.voiceConnection.destroy();
          session.voiceConnection = undefined;
          
          broadcast({
            type: 'voice_left',
            sessionId: session.id
          });
        }

        return {
          content: [{
            type: 'text',
            text: 'Left voice channel'
          }]
        };
      }

      case 'discord_list_guilds': {
        const session = await getSession(args?.sessionId as string, args?.token as string);
        
        const guilds = session.client.guilds.cache.map(guild => ({
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount,
          owner: guild.ownerId
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(guilds, null, 2)
          }]
        };
      }

      case 'discord_list_channels': {
        const session = await getSession(args?.sessionId as string, args?.token as string);
        const guildId = args?.guildId as string;

        const guild = session.client.guilds.cache.get(guildId);
        if (!guild) {
          throw new Error('Guild not found');
        }

        const channels = guild.channels.cache.map(channel => ({
          id: channel.id,
          name: channel.name,
          type: channel.type === 0 ? 'text' : channel.type === 2 ? 'voice' : 'other',
          parent: channel.parent?.name || 'No Category'
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(channels, null, 2)
          }]
        };
      }

      case 'discord_create_channel': {
        const session = await getSession(args?.sessionId as string, args?.token as string);
        const guildId = args?.guildId as string;
        const name = args?.name as string;
        const type = args?.type as string || 'text';
        const categoryName = args?.category as string | undefined;

        const guild = session.client.guilds.cache.get(guildId);
        if (!guild) {
          throw new Error('Guild not found');
        }

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

        broadcast({
          type: 'channel_created',
          sessionId: session.id,
          channelId: channel.id,
          channelName: channel.name,
          guildId
        });

        return {
          content: [{
            type: 'text',
            text: `Created ${type} channel: ${channel.name} (${channel.id})`
          }]
        };
      }

      case 'discord_upload_file': {
        const session = await getSession(args?.sessionId as string, args?.token as string);
        const channelId = args?.channelId as string;
        const filePath = args?.filePath as string;
        const message = args?.message as string | undefined;

        const channel = await session.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          throw new Error('Invalid text channel');
        }

        const sent = await (channel as TextChannel).send({
          content: message || '',
          files: [filePath]
        });

        broadcast({
          type: 'file_uploaded',
          sessionId: session.id,
          channelId,
          messageId: sent.id
        });

        return {
          content: [{
            type: 'text',
            text: `File uploaded to channel ${channelId}`
          }]
        };
      }

      case 'discord_get_sessions': {
        const sessionList = Array.from(sessions.entries()).map(([id, session]) => ({
          id,
          username: session.client.user?.username,
          guilds: session.client.guilds.cache.size,
          inVoice: !!session.voiceConnection,
          createdAt: session.createdAt,
          lastUsed: session.lastUsed
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(sessionList, null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error(`Tool error: ${error}`);
    throw error;
  }
});

// Main startup
async function main() {
  logger.info('Starting Discord Tools MCP Server...');
  
  // Start Express server
  app.listen(config.port, () => {
    logger.info(`SSE server listening on port ${config.port}`);
  });

  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Set up cleanup interval
  setInterval(cleanupSessions, 5 * 60 * 1000); // Every 5 minutes
  
  logger.info('Discord Tools Server ready!');
}

// Error handling
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  
  // Close all sessions
  for (const session of sessions.values()) {
    if (session.voiceConnection) {
      session.voiceConnection.destroy();
    }
    await session.client.destroy();
  }
  
  process.exit(0);
});

// Start everything
main().catch((error) => {
  logger.error('Failed to start:', error);
  process.exit(1);
});