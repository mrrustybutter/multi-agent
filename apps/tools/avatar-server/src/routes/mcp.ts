import { Router } from 'express';
import { SSEHandler } from '../mcp/SSEHandler';
import { ToolHandler } from '../mcp/ToolHandler';
import { MCPRequest } from '../types';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('mcp-routes');

export function createMCPRouter(sseHandler: SSEHandler, toolHandler: ToolHandler): Router {
  const router = Router();

  // SSE endpoint for MCP
  router.get('/sse', (req, res) => {
    sseHandler.handleConnection(res);
  });

  // JSON-RPC endpoint for MCP
  router.post('/rpc', async (req, res) => {
    try {
      const request: MCPRequest = req.body;
      const response = await toolHandler.handleRequest(request);
      res.json(response);
    } catch (error) {
      logger.error('Error handling RPC request:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        }
      });
    }
  });

  // List available tools
  router.get('/tools', (req, res) => {
    res.json({
      tools: sseHandler.getTools()
    });
  });

  return router;
}