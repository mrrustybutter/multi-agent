import { Router } from 'express';
import { SSEHandler } from '../mcp/SSEHandler';
import { ToolHandler } from '../mcp/ToolHandler';
import { ElevenLabsService } from '../services/ElevenLabsService';
import { MCPRequest } from '../types';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('elevenlabs-routes');

export function createRoutes(
  elevenLabsService: ElevenLabsService,
  sseHandler: SSEHandler,
  toolHandler: ToolHandler
): Router {
  const router = Router();

  // SSE endpoint for MCP
  router.get('/sse', (req, res) => {
    sseHandler.handleConnection(req, res);
  });

  // SSE endpoint for MCP (POST for requests)
  router.post('/sse', (req, res) => {
    sseHandler.handleConnection(req, res);
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

  // Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      api_key_configured: !!process.env.ELEVEN_API_KEY,
      voice_id: process.env.ELEVENLABS_VOICE_ID || 'Au8OOcCmvsCaQpmULvvQ',
      timestamp: new Date().toISOString()
    });
  });

  // List available tools
  router.get('/tools', (req, res) => {
    res.json({
      tools: toolHandler.getTools()
    });
  });

  // Direct API endpoints (for testing/debugging)
  router.post('/tools/generate_audio', async (req, res) => {
    try {
      const result = await elevenLabsService.generateAudio(req.body);
      res.json({ jsonrpc: '2.0', result });
    } catch (error) {
      logger.error('Error generating audio:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -1,
          message: (error as Error).message
        }
      });
    }
  });

  router.post('/tools/stream_audio', async (req, res) => {
    try {
      const result = await elevenLabsService.streamAudio(req.body);
      res.json({ jsonrpc: '2.0', result });
    } catch (error) {
      logger.error('Error streaming audio:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -1,
          message: (error as Error).message
        }
      });
    }
  });

  router.post('/tools/list_voices', async (req, res) => {
    try {
      const result = await elevenLabsService.listVoices();
      res.json({ jsonrpc: '2.0', result });
    } catch (error) {
      logger.error('Error listing voices:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -1,
          message: (error as Error).message
        }
      });
    }
  });

  return router;
}