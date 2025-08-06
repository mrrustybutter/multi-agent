import express from 'express';
import { createLogger } from '@rusty-butter/logger';

const logger = createLogger('sse-manager');

export interface SSEEvent {
  type: string;
  data?: any;
  timestamp?: string;
}

export class SSEManager {
  private clients = new Set<express.Response>();

  constructor() {
    logger.info('SSE Manager initialized');
  }

  addClient(res: express.Response): void {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    this.clients.add(res);
    logger.info(`SSE client connected (total: ${this.clients.size})`);

    // Send initial connection event
    this.sendToClient(res, {
      type: 'connected',
      timestamp: new Date().toISOString()
    });
  }

  removeClient(res: express.Response): void {
    this.clients.delete(res);
    logger.info(`SSE client disconnected (remaining: ${this.clients.size})`);
  }

  broadcast(event: SSEEvent): void {
    if (!event.timestamp) {
      event.timestamp = new Date().toISOString();
    }

    const data = `data: ${JSON.stringify(event)}\n\n`;
    
    // Send to all clients and remove any that fail
    const failedClients: express.Response[] = [];
    
    this.clients.forEach(client => {
      try {
        client.write(data);
      } catch (error) {
        logger.warn('Failed to send to SSE client:', error);
        failedClients.push(client);
      }
    });

    // Clean up failed clients
    failedClients.forEach(client => this.removeClient(client));
  }

  sendToClient(client: express.Response, event: SSEEvent): void {
    if (!event.timestamp) {
      event.timestamp = new Date().toISOString();
    }

    try {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      client.write(data);
    } catch (error) {
      logger.warn('Failed to send to SSE client:', error);
      this.removeClient(client);
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  // Send heartbeat to keep connections alive
  sendHeartbeat(): void {
    this.broadcast({
      type: 'heartbeat',
      timestamp: new Date().toISOString()
    });
  }

  // Notify about browser events
  notifySessionCreated(sessionId: string): void {
    this.broadcast({
      type: 'session_created',
      data: { sessionId }
    });
  }

  notifySessionClosed(sessionId: string): void {
    this.broadcast({
      type: 'session_closed',
      data: { sessionId }
    });
  }

  notifyPageCreated(sessionId: string, pageId: string, url?: string): void {
    this.broadcast({
      type: 'page_created',
      data: { sessionId, pageId, url }
    });
  }

  notifyPageNavigated(sessionId: string, pageId: string, url: string): void {
    this.broadcast({
      type: 'page_navigated',
      data: { sessionId, pageId, url }
    });
  }

  notifyError(error: string, details?: any): void {
    this.broadcast({
      type: 'error',
      data: { error, details }
    });
  }
}