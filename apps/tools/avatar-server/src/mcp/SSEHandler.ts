import { Response } from 'express';
import { MCPRequest, MCPResponse, MCPTool } from '../types';
import { AvatarService } from '../services/AvatarService';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('mcp-sse');

export class SSEHandler {
  private clients = new Set<Response>();
  private avatarService: AvatarService;

  constructor(avatarService: AvatarService) {
    this.avatarService = avatarService;
  }

  handleConnection(res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    this.clients.add(res);
    logger.info('MCP client connected via SSE');

    // Send initialization
    this.sendInitialization(res);

    // Send heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 30000);

    // Handle disconnect
    res.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
      logger.info('MCP client disconnected');
    });
  }

  private sendInitialization(res: Response) {
    const initMessage: MCPResponse = {
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          prompts: {}
        },
        serverInfo: {
          name: 'rustybutter-avatar',
          version: '1.0.0'
        }
      }
    };

    this.sendSSEMessage(res, 'message', initMessage);
  }

  private sendSSEMessage(res: Response, event: string, data: any) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  broadcast(message: MCPResponse) {
    this.clients.forEach(client => {
      this.sendSSEMessage(client, 'message', message);
    });
  }

  getTools(): MCPTool[] {
    return [
      {
        name: 'setAvatarExpression',
        description: 'Set the avatar expression and optionally update position/rotation/scale',
        inputSchema: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'Expression name (e.g., joyful, thinking, excited)',
              enum: this.avatarService.listExpressions().map(e => e.name)
            },
            direction: {
              type: 'string',
              enum: ['left', 'right'],
              description: 'Direction avatar faces'
            },
            posX: {
              type: 'number',
              description: 'X position offset'
            },
            posY: {
              type: 'number',
              description: 'Y position offset'
            },
            rotation: {
              type: 'number',
              description: 'Rotation in degrees'
            },
            scale: {
              type: 'number',
              description: 'Scale factor (1.0 = normal size)'
            }
          },
          required: ['expression']
        }
      },
      {
        name: 'listAvatarExpressions',
        description: 'List all available avatar expressions',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'setBatchExpressions',
        description: 'Set a sequence of avatar expressions with timing',
        inputSchema: {
          type: 'object',
          properties: {
            loop: {
              type: 'boolean',
              description: 'Whether to loop the animation sequence'
            },
            random: {
              type: 'boolean',
              description: 'Whether to randomize the order of expressions'
            },
            actions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  expression: {
                    type: 'string',
                    description: 'Expression name'
                  },
                  duration: {
                    type: 'number',
                    description: 'Duration in milliseconds'
                  },
                  direction: {
                    type: 'string',
                    enum: ['left', 'right']
                  },
                  posX: { type: 'number' },
                  posY: { type: 'number' },
                  rotation: { type: 'number' },
                  scale: { type: 'number' }
                },
                required: ['expression', 'duration']
              }
            }
          },
          required: ['actions']
        }
      },
      {
        name: 'getAvatarStatus',
        description: 'Get current avatar status including expression and state',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'getAvatarWebInterface',
        description: 'Get the URL for the avatar web interface (for OBS browser source)',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }
}