#!/usr/bin/env tsx

/**
 * Twitch Chat MCP Server
 * Provides MCP tools for sending messages to Twitch chat
 */

import express from 'express';
import cors from 'cors';
import tmi from 'tmi.js';
import { getLogger } from '@rusty-butter/logger';
import { getPort } from '@rusty-butter/shared';

const logger = getLogger('twitch-chat');

// Initialize Express app for SSE
const app = express();
app.use(cors());
app.use(express.json());

// Twitch client
let twitchClient: tmi.Client | null = null;
let isConnected = false;

// Initialize Twitch client
async function initializeTwitchClient() {
  if (!process.env.TWITCH_USERNAME || !process.env.TWITCH_OAUTH) {
    logger.warn('Missing Twitch credentials - chat functionality will be limited');
    return;
  }

  twitchClient = new tmi.Client({
    options: { debug: false },
    identity: {
      username: process.env.TWITCH_USERNAME,
      password: process.env.TWITCH_OAUTH
    },
    channels: [process.env.TWITCH_CHANNEL || 'codingbutter']
  });

  twitchClient.on('connected', () => {
    logger.info('Connected to Twitch chat');
    isConnected = true;
  });

  twitchClient.on('disconnected', () => {
    logger.warn('Disconnected from Twitch chat');
    isConnected = false;
  });

  try {
    await twitchClient.connect();
  } catch (error) {
    logger.error('Failed to connect to Twitch:', error);
  }
}

// SSE clients
const sseClients = new Set<express.Response>();

// SSE endpoint for MCP
app.get('/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  sseClients.add(res);
  logger.info('MCP client connected via SSE');

  // Send initial handshake
  res.write('event: initialize\n');
  res.write(`data: ${JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'twitch-chat',
        version: '0.1.0'
      }
    }
  })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
    logger.info('MCP client disconnected');
  });
});

// MCP tool: send_message
app.post('/tools/send_message', async (req, res) => {
  const { channel, message } = req.body;
  
  try {
    if (!isConnected || !twitchClient) {
      throw new Error('Not connected to Twitch chat');
    }

    const targetChannel = channel || process.env.TWITCH_CHANNEL || 'codingbutter';
    await twitchClient.say(targetChannel, message);
    
    logger.info(`Message sent to #${targetChannel}: ${message}`);
    
    res.json({
      jsonrpc: '2.0',
      result: {
        success: true,
        message: `Message sent to #${targetChannel}`,
        sentMessage: message
      }
    });
  } catch (error) {
    logger.error('Failed to send Twitch message:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -1,
        message: `Failed to send message: ${error}`
      }
    });
  }
});

// MCP tool: get_status
app.post('/tools/get_status', (req, res) => {
  res.json({
    jsonrpc: '2.0',
    result: {
      connected: isConnected,
      channel: process.env.TWITCH_CHANNEL || 'codingbutter',
      username: process.env.TWITCH_USERNAME || 'unknown'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    connected: isConnected,
    timestamp: new Date().toISOString()
  });
});

// Tools list endpoint
app.get('/tools', (req, res) => {
  res.json({
    tools: [
      {
        name: 'send_message',
        description: 'Send a message to Twitch chat',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to send'
            },
            channel: {
              type: 'string',
              description: 'The channel to send to (optional, defaults to configured channel)'
            }
          },
          required: ['message']
        }
      },
      {
        name: 'get_status',
        description: 'Get current Twitch connection status',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  });
});

// Start server
const PORT = getPort('twitch-chat') || 3455;

async function start() {
  await initializeTwitchClient();
  
  app.listen(PORT, () => {
    logger.info(`Twitch Chat MCP Server running on port ${PORT}`);
    logger.info(`SSE endpoint: http://localhost:${PORT}/sse`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
  });
}

start().catch(error => {
  logger.error('Failed to start Twitch Chat MCP Server:', error);
  process.exit(1);
});