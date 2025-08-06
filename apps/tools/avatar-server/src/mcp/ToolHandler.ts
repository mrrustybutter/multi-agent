import { MCPRequest, MCPResponse } from '../types';
import { AvatarService } from '../services/AvatarService';
import { SSEHandler } from './SSEHandler';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('mcp-tools');

export class ToolHandler {
  constructor(
    private avatarService: AvatarService,
    private sseHandler: SSEHandler
  ) {}

  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      switch (request.method) {
        case 'tools/list':
          return this.handleListTools(request);
        
        case 'tools/call':
          return this.handleToolCall(request);
        
        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`
            }
          };
      }
    } catch (error) {
      logger.error('Error handling MCP request:', error);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Internal error: ${error}`
        }
      };
    }
  }

  private handleListTools(request: MCPRequest): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: this.sseHandler.getTools()
      }
    };
  }

  private async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    const { name, arguments: args } = request.params;

    try {
      let result: any;

      switch (name) {
        case 'setAvatarExpression':
          result = this.avatarService.setExpression(
            args.expression,
            {
              direction: args.direction,
              posX: args.posX,
              posY: args.posY,
              rotation: args.rotation,
              scale: args.scale
            }
          );
          break;

        case 'listAvatarExpressions':
          result = {
            expressions: this.avatarService.listExpressions(),
            current: this.avatarService.getCurrentExpression()
          };
          break;

        case 'setBatchExpressions':
          result = this.avatarService.setBatchExpressions({
            loop: args.loop || false,
            random: args.random || false,
            actions: args.actions
          });
          break;

        case 'getAvatarStatus':
          result = this.avatarService.getStatus();
          break;

        case 'getAvatarWebInterface':
          const port = process.env.AVATAR_PORT || 8080;
          result = {
            url: `http://localhost:${port}`,
            obsSourceUrl: `http://localhost:${port}/avatar.html`,
            instructions: 'Add this URL as a Browser Source in OBS (width: 512, height: 512)'
          };
          break;

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            }
          };
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };
    } catch (error) {
      logger.error(`Error executing tool ${name}:`, error);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Tool execution failed: ${error}`
        }
      };
    }
  }
}