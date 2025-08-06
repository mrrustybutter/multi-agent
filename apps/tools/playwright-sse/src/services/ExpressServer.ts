import express from 'express';
import { Server as HttpServer } from 'http';
import { createLogger } from '@rusty-butter/logger';
import { SSEManager } from './SSEManager';
import { BrowserManager } from './BrowserManager';

const logger = createLogger('express-server');

export class ExpressServer {
  private app: express.Application;
  private server?: HttpServer;
  private port: number;

  constructor(
    port: number,
    private sseManager: SSEManager,
    private browserManager: BrowserManager
  ) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });
  }

  private setupRoutes(): void {
    // SSE endpoint
    this.app.get('/events', (req, res) => {
      this.sseManager.addClient(res);

      // Send current sessions
      const sessionIds = this.browserManager.getSessionIds();
      this.sseManager.sendToClient(res, {
        type: 'sessions',
        data: { sessions: sessionIds }
      });

      req.on('close', () => {
        this.sseManager.removeClient(res);
      });
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'playwright-sse',
        activeSessions: this.browserManager.getSessionIds().length,
        sseClients: this.sseManager.getClientCount(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Session management endpoints
    this.app.get('/sessions', (req, res) => {
      const sessions = this.browserManager.getAllSessions();
      const sessionData = Array.from(sessions.entries()).map(([id, session]) => ({
        id,
        pageCount: session.pages.size,
        createdAt: session.createdAt,
        lastUsed: session.lastUsed
      }));
      res.json(sessionData);
    });

    this.app.post('/sessions', async (req, res) => {
      try {
        const session = await this.browserManager.createSession();
        this.sseManager.notifySessionCreated(session.id);
        res.json({ sessionId: session.id });
      } catch (error) {
        logger.error('Failed to create session:', error);
        res.status(500).json({ error: 'Failed to create session' });
      }
    });

    this.app.delete('/sessions/:id', async (req, res) => {
      try {
        await this.browserManager.closeSession(req.params.id);
        this.sseManager.notifySessionClosed(req.params.id);
        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to close session:', error);
        res.status(500).json({ error: 'Failed to close session' });
      }
    });

    // Debug endpoint
    this.app.get('/debug', (req, res) => {
      const sessions = this.browserManager.getAllSessions();
      const debugInfo = {
        sessions: Array.from(sessions.entries()).map(([id, session]) => ({
          id,
          pages: Array.from(session.pages.keys()),
          createdAt: session.createdAt,
          lastUsed: session.lastUsed
        })),
        sseClients: this.sseManager.getClientCount(),
        memory: process.memoryUsage(),
        uptime: process.uptime()
      };
      res.json(debugInfo);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info(`Express server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Express server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}