#!/usr/bin/env tsx
/**
 * ElevenLabs MCP SSE Server
 * Provides MCP tools for text-to-speech using ElevenLabs API
 */

import express from 'express';
import cors from 'cors';
import { getLogger } from '@rusty-butter/logger';
import { getPort } from '@rusty-butter/shared';

// Services and handlers
import { ElevenLabsService } from './services/ElevenLabsService';
import { SSEHandler } from './mcp/SSEHandler';
import { ToolHandler } from './mcp/ToolHandler';
import { createRoutes } from './routes';

const logger = getLogger('elevenlabs');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Initialize services
const elevenLabsService = new ElevenLabsService();
const toolHandler = new ToolHandler(elevenLabsService);
const sseHandler = new SSEHandler(toolHandler);

// Mount routes
app.use('/', createRoutes(elevenLabsService, sseHandler, toolHandler));

// Start server
const PORT = getPort('elevenlabs') || 3454;

app.listen(PORT, () => {
  logger.info(`ElevenLabs MCP SSE Server running on port ${PORT}`);
  logger.info(`MCP SSE endpoint: http://localhost:${PORT}/sse`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`API key configured: ${!!process.env.ELEVEN_API_KEY}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down ElevenLabs server...');
  process.exit(0);
});