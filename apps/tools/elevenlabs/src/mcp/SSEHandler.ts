import { Request, Response } from 'express';
import { MCPRequest, MCPResponse, MCPTool } from '../types';
import { ToolHandler } from './ToolHandler';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('elevenlabs-mcp-sse');

export class SSEHandler {
  private clients = new Set<Response>();
  private toolHandler: ToolHandler;

  constructor(toolHandler: ToolHandler) {
    this.toolHandler = toolHandler;
  }

  handleConnection(req: Request, res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });

    this.clients.add(res);
    logger.info('MCP client connected via SSE');

    // Handle incoming data (MCP requests over POST)
    if (req.method === 'POST') {
      let buffer = '';
      req.on('data', (chunk) => {
        buffer += chunk.toString();
      });
      
      req.on('end', async () => {
        if (buffer.trim()) {
          try {
            const request: MCPRequest = JSON.parse(buffer);
            await this.handleMCPRequest(request, res);
          } catch (error) {
            logger.error('Error parsing MCP request:', error);
            this.sendErrorResponse(res, null, -32700, 'Parse error');
          }
        }
      });
    } else {
      // For GET requests, just keep connection alive
      res.write(': MCP SSE server ready\n\n');
      
      // Send heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
        } catch (error) {
          clearInterval(heartbeat);
        }
      }, 30000);

      // Handle disconnect
      res.on('close', () => {
        clearInterval(heartbeat);
        this.clients.delete(res);
        logger.info('MCP client disconnected');
      });
    }
  }

  private async handleMCPRequest(request: MCPRequest, res: Response) {
    try {
      logger.info(`🔄 MCP REQUEST: ${request.method} (ID: ${request.id})`);
      
      // Handle initialize request specially
      if (request.method === 'initialize') {
        logger.info(`🚀 Client initializing with capabilities`);
        const response: MCPResponse = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {
                listChanged: false
              }
            },
            serverInfo: {
              name: 'elevenlabs-mcp-server',
              version: '1.0.0'
            }
          }
        };
        this.sendResponse(res, response);
        logger.info(`✅ Initialization response sent`);
        return;
      }
      
      // Handle initialized notification
      if (request.method === 'notifications/initialized') {
        logger.info('🎉 Client initialization complete - ready for tool calls!');
        return; // No response needed for notifications
      }
      
      // Handle tools/list request
      if (request.method === 'tools/list') {
        logger.info(`📋 Client requesting tool list`);
      }
      
      const response = await this.toolHandler.handleRequest(request);
      this.sendResponse(res, response);
      logger.info(`✅ MCP response sent for ${request.method} (ID: ${request.id})`);
      
    } catch (error) {
      logger.error(`❌ MCP request failed: ${request.method} (ID: ${request.id})`, error);
      this.sendErrorResponse(res, request.id, -32603, 'Internal server error');
    }
  }

  private sendResponse(res: Response, response: MCPResponse) {
    try {
      res.write(`data: ${JSON.stringify(response)}\n\n`);
    } catch (error) {
      logger.error('Error sending response:', error);
    }
  }

  private sendErrorResponse(res: Response, id: any, code: number, message: string) {
    const errorResponse: MCPResponse = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };
    this.sendResponse(res, errorResponse);
  }

  broadcast(message: MCPResponse) {
    this.clients.forEach(client => {
      try {
        client.write(`data: ${JSON.stringify(message)}\n\n`);
      } catch (error) {
        logger.error('Error broadcasting message:', error);
        this.clients.delete(client);
      }
    });
  }
}