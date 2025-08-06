#!/usr/bin/env node
/**
 * Avatar MCP Server with SSE - Model Context Protocol server for avatar control
 * 
 * This MCP server provides tools for Claude to control the avatar's expressions
 * and animations via HTTP requests to the avatar server. Uses SSE for communication.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { getPort } from '@rusty-butter/shared';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('avatar-mcp');

// Configuration
const config = {
  port: getPort('avatar-server') + 1, // Use avatar server port + 1 for MCP
  avatarServerUrl: `http://localhost:${getPort('avatar-server')}`,
};

// State
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
  logger.info('SSE client connected to Avatar MCP server');

  req.on('close', () => {
    sseClients.delete(res);
    logger.info('SSE client disconnected from Avatar MCP server');
  });
});

// Broadcast to all SSE clients
function broadcast(event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(message);
    } catch (error) {
      logger.warn('Failed to send SSE message:', error);
      sseClients.delete(client);
    }
  });
}

// MCP Server setup
const server = new Server(
  {
    name: 'avatar-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to make HTTP requests to avatar server
async function makeAvatarRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', data?: any) {
  try {
    const url = `${config.avatarServerUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data && method === 'POST') {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Broadcast the action to SSE clients
    broadcast('avatar_action', {
      endpoint,
      method,
      data,
      result,
      timestamp: new Date().toISOString()
    });
    
    return result;
  } catch (error) {
    logger.error(`Avatar server request failed: ${error}`);
    
    // Broadcast the error to SSE clients
    broadcast('avatar_error', {
      endpoint,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
    
    throw error;
  }
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'setAvatarExpression',
        description: 'Set the avatar\'s expression and appearance properties',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Expression name (e.g., joyful, focused, confused, frustrated, excited, thinking, sleepy, surprised)',
            },
            direction: {
              type: 'string',
              enum: ['left', 'right'],
              description: 'Direction the avatar should face',
            },
            posX: {
              type: 'number',
              description: 'Horizontal position offset in pixels',
            },
            posY: {
              type: 'number', 
              description: 'Vertical position offset in pixels',
            },
            rotation: {
              type: 'number',
              minimum: -30,
              maximum: 30,
              description: 'Rotation angle in degrees (-30 to 30)',
            },
            scale: {
              type: 'number',
              minimum: 0.1,
              maximum: 3.0,
              description: 'Scale factor (0.1 to 3.0, where 1.0 is 100% size)',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'listAvatarExpressions',
        description: 'Get a list of all available avatar expressions',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'setBatchExpressions',
        description: 'Set a sequence of expressions for animation',
        inputSchema: {
          type: 'object',
          properties: {
            loop: {
              type: 'boolean',
              description: 'Whether to loop the animation sequence',
            },
            random: {
              type: 'boolean',
              description: 'Whether to play actions in random order',
            },
            actions: {
              type: 'array',
              description: 'Array of expression actions',
              items: {
                type: 'object',
                properties: {
                  expression: {
                    type: 'string',
                    description: 'Expression name',
                  },
                  duration: {
                    type: 'number',
                    description: 'Duration in milliseconds',
                  },
                  direction: {
                    type: 'string',
                    enum: ['left', 'right'],
                  },
                  posX: { type: 'number' },
                  posY: { type: 'number' },
                  rotation: { type: 'number', minimum: -30, maximum: 30 },
                  scale: { type: 'number', minimum: 0.1, maximum: 3.0 },
                },
                required: ['expression'],
              },
            },
          },
          required: ['actions'],
        },
      },
      {
        name: 'getAvatarStatus',
        description: 'Get current avatar status and configuration',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'setAvatarExpression': {
        const params = args as any;
        logger.info(`Setting avatar expression: ${params?.name}`);
        const result = await makeAvatarRequest('/api/set-expression', 'POST', params) as any;
        return {
          content: [
            {
              type: 'text',
              text: `Avatar expression set to "${params?.name}" successfully. ${result?.success ? 'Applied settings: ' + JSON.stringify({
                direction: result?.direction,
                position: `(${result?.posX || 0}, ${result?.posY || 0})`,
                rotation: `${result?.rotation || 0}°`,
                scale: `${Math.round((result?.scale || 1) * 100)}%`
              }) : ''}`,
            },
          ],
        };
      }

      case 'listAvatarExpressions': {
        logger.info('Listing available avatar expressions');
        const expressions = await makeAvatarRequest('/api/expressions') as any[];
        
        const expressionList = (expressions || [])
          .map((exp: any) => `• **${exp.name}**: ${exp.description} - ${exp.useCases}`)
          .join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Available Avatar Expressions:\n\n${expressionList}`,
            },
          ],
        };
      }

      case 'setBatchExpressions': {
        const params = args as any;
        logger.info(`Setting batch expressions with ${params?.actions?.length || 0} actions`);
        const result = await makeAvatarRequest('/api/set-batch-expressions', 'POST', params) as any;
        
        return {
          content: [
            {
              type: 'text',
              text: `Batch expressions set successfully! Batch ID: ${result?.batchId}, Actions: ${result?.actionCount}, Looping: ${result?.loop}`,
            },
          ],
        };
      }

      case 'getAvatarStatus': {
        logger.info('Getting avatar status');
        const status = await makeAvatarRequest('/api/status') as any;
        
        return {
          content: [
            {
              type: 'text',
              text: `Avatar Status:
• Current Expression: ${status?.currentExpression || 'Unknown'}
• Available Expressions: ${status?.availableExpressions?.join(', ') || 'None'}
• Batch Animation Active: ${status?.batchActive ? 'Yes' : 'No'}
• Server Port: ${status?.port || 'Unknown'}
• Status: ${status?.status || 'Unknown'}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error(`Tool execution failed: ${error}`);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

// Cleanup function
function cleanupSessions() {
  // Remove stale SSE connections
  const now = Date.now();
  sseClients.forEach(client => {
    try {
      client.write('event: ping\ndata: {}\n\n');
    } catch {
      sseClients.delete(client);
    }
  });
}

// Start both MCP and SSE servers
async function main() {
  try {
    // Start MCP server with stdio transport (for orchestrator connection)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    // Start Express server for SSE
    app.listen(config.port, () => {
      logger.info(`Avatar MCP Server with SSE running on port ${config.port}`);
      logger.info(`SSE endpoint available at http://localhost:${config.port}/events`);
      logger.info(`Connecting to avatar server at ${config.avatarServerUrl}`);
    });
    
    // Set up cleanup interval
    setInterval(cleanupSessions, 30000); // Every 30 seconds
    
    logger.info('Avatar MCP server ready!');
    
  } catch (error) {
    logger.error('Failed to start Avatar MCP server:', error);
    process.exit(1);
  }
}

main();