#!/usr/bin/env node
/**
 * RustyButter Avatar MCP SSE Server
 * 
 * Provides both:
 * - MCP SSE interface for Claude integration
 * - WebSocket interface for web clients (OBS browser source)
 * - HTTP API for direct control
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { createServer } from 'http';
import { getPort } from '@rusty-butter/shared';
import { getLogger } from '@rusty-butter/logger';

// Services
import { AvatarService } from './services/AvatarService';
import { SSEHandler } from './mcp/SSEHandler';
import { ToolHandler } from './mcp/ToolHandler';
import { WebSocketHandler } from './handlers/WebSocketHandler';

// Routes
import { createApiRouter } from './routes/api';
import { createMCPRouter } from './routes/mcp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = getLogger('avatar-server');

// Initialize Express app
const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Initialize services
const avatarService = new AvatarService();
const sseHandler = new SSEHandler(avatarService);
const toolHandler = new ToolHandler(avatarService, sseHandler);
const wsHandler = new WebSocketHandler(avatarService, server);

// Mount routes
app.use('/api', createApiRouter(avatarService));
app.use('/', createMCPRouter(sseHandler, toolHandler));

// Start server
const PORT = getPort('avatar-server') || 8080;

server.listen(PORT, () => {
  logger.info(`Avatar MCP SSE Server running on port ${PORT}`);
  logger.info(`MCP SSE endpoint: http://localhost:${PORT}/sse`);
  logger.info(`Web interface: http://localhost:${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down avatar server...');
  server.close(() => {
    logger.info('Avatar server shut down');
    process.exit(0);
  });
});