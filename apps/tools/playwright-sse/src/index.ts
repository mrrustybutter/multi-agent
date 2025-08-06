#!/usr/bin/env tsx

/**
 * Playwright SSE Server - Persistent browser with Server-Sent Events
 * Maintains browser sessions across multiple Claude instances
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import express from 'express';
import { createLogger } from '@rusty-butter/logger';
import { randomBytes } from 'crypto';
import { getPort } from '@rusty-butter/shared';
import { IDEIntegration, IDESession, CodeNavigationEvent } from './ide-integration.js';

// Logger setup
const logger = createLogger('playwright-sse');

// Types
interface BrowserSession {
  id: string;
  context: BrowserContext;
  pages: Map<string, Page>;
  createdAt: Date;
  lastUsed: Date;
}

// Configuration
const config = {
  port: getPort('playwright-sse'),
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  maxSessions: 10,
  headless: process.env.PLAYWRIGHT_HEADLESS !== 'false'
};

// State
const sessions = new Map<string, BrowserSession>();
let browser: Browser | null = null;
let sseClients = new Set<express.Response>();
const ideIntegration = new IDEIntegration();

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
  logger.info('SSE client connected');

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', sessions: Array.from(sessions.keys()) })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
    logger.info('SSE client disconnected');
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'playwright-sse',
    activeSessions: sessions.size,
    sseClients: sseClients.size,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Broadcast to all SSE clients
function broadcast(event: any) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach(client => client.write(data));
}

// Initialize browser
async function initBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    logger.info('Browser launched');
  }
  return browser;
}

// Create new session
async function createSession(): Promise<BrowserSession> {
  const browser = await initBrowser();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const session: BrowserSession = {
    id: randomBytes(16).toString('hex'),
    context,
    pages: new Map(),
    createdAt: new Date(),
    lastUsed: new Date()
  };

  sessions.set(session.id, session);
  broadcast({ type: 'session_created', sessionId: session.id });
  logger.info(`Session created: ${session.id}`);

  return session;
}

// Get or create page
async function getPage(sessionId: string, pageId: string = 'default'): Promise<Page> {
  let session = sessions.get(sessionId);
  
  if (!session) {
    session = await createSession();
  }

  session.lastUsed = new Date();
  
  let page = session.pages.get(pageId);
  if (!page) {
    page = await session.context.newPage();
    session.pages.set(pageId, page);
    
    // Set up console logging
    page.on('console', msg => {
      broadcast({
        type: 'console',
        sessionId,
        pageId,
        level: msg.type(),
        text: msg.text()
      });
    });

    // Set up error handling
    page.on('pageerror', error => {
      broadcast({
        type: 'error',
        sessionId,
        pageId,
        error: error.message
      });
    });
  }

  return page;
}

// Clean up old sessions
async function cleanupSessions() {
  const now = Date.now();
  
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastUsed.getTime() > config.sessionTimeout) {
      await session.context.close();
      sessions.delete(id);
      broadcast({ type: 'session_closed', sessionId: id });
      logger.info(`Session cleaned up: ${id}`);
    }
  }
}

// MCP Server
const server = new Server(
  {
    name: 'playwright-sse',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// MCP Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'navigate',
      description: 'Navigate to a URL in a persistent browser session',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
          sessionId: { type: 'string', description: 'Session ID (creates new if not provided)' },
          pageId: { type: 'string', description: 'Page ID within session', default: 'default' },
          waitUntil: { 
            type: 'string', 
            enum: ['load', 'domcontentloaded', 'networkidle'],
            default: 'load'
          }
        },
        required: ['url']
      }
    },
    {
      name: 'screenshot',
      description: 'Take a screenshot of the current page',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          pageId: { type: 'string', description: 'Page ID', default: 'default' },
          fullPage: { type: 'boolean', description: 'Capture full page', default: false }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'click',
      description: 'Click an element',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          pageId: { type: 'string', description: 'Page ID', default: 'default' },
          selector: { type: 'string', description: 'CSS selector' }
        },
        required: ['sessionId', 'selector']
      }
    },
    {
      name: 'type',
      description: 'Type text into an input',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          pageId: { type: 'string', description: 'Page ID', default: 'default' },
          selector: { type: 'string', description: 'CSS selector' },
          text: { type: 'string', description: 'Text to type' }
        },
        required: ['sessionId', 'selector', 'text']
      }
    },
    {
      name: 'evaluate',
      description: 'Execute JavaScript in the page',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          pageId: { type: 'string', description: 'Page ID', default: 'default' },
          script: { type: 'string', description: 'JavaScript code to execute' }
        },
        required: ['sessionId', 'script']
      }
    },
    {
      name: 'get_sessions',
      description: 'List all active browser sessions',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'close_session',
      description: 'Close a specific browser session',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID to close' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'create_ide_session',
      description: 'Create a new IDE development session',
      inputSchema: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            enum: ['vscode', 'browser-dev', 'terminal', 'file-explorer'],
            description: 'Type of IDE session'
          },
          sessionId: { type: 'string', description: 'Browser session ID to use' }
        },
        required: ['type', 'sessionId']
      }
    },
    {
      name: 'open_vscode',
      description: 'Open VS Code in the IDE session',
      inputSchema: {
        type: 'object',
        properties: {
          ideSessionId: { type: 'string', description: 'IDE session ID' },
          projectPath: { type: 'string', description: 'Optional project path to open' }
        },
        required: ['ideSessionId']
      }
    },
    {
      name: 'navigate_code',
      description: 'Navigate code in IDE session',
      inputSchema: {
        type: 'object',
        properties: {
          ideSessionId: { type: 'string', description: 'IDE session ID' },
          action: { 
            type: 'string', 
            enum: ['navigate-to-file', 'find-definition', 'find-references', 'search-symbols'],
            description: 'Navigation action'
          },
          filePath: { type: 'string', description: 'File path (for navigate-to-file)' },
          line: { type: 'number', description: 'Line number (optional)' },
          column: { type: 'number', description: 'Column number (optional)' },
          symbol: { type: 'string', description: 'Symbol name (for find actions)' },
          query: { type: 'string', description: 'Search query (for search-symbols)' }
        },
        required: ['ideSessionId', 'action']
      }
    },
    {
      name: 'capture_ide_state',
      description: 'Take screenshot of current IDE state',
      inputSchema: {
        type: 'object',
        properties: {
          ideSessionId: { type: 'string', description: 'IDE session ID' }
        },
        required: ['ideSessionId']
      }
    },
    {
      name: 'start_recording',
      description: 'Start recording screen activity',
      inputSchema: {
        type: 'object',
        properties: {
          ideSessionId: { type: 'string', description: 'IDE session ID' }
        },
        required: ['ideSessionId']
      }
    },
    {
      name: 'stop_recording',
      description: 'Stop screen recording and get metadata',
      inputSchema: {
        type: 'object',
        properties: {
          recordingId: { type: 'string', description: 'Recording ID' }
        },
        required: ['recordingId']
      }
    },
    {
      name: 'execute_terminal',
      description: 'Execute terminal command in IDE',
      inputSchema: {
        type: 'object',
        properties: {
          ideSessionId: { type: 'string', description: 'IDE session ID' },
          command: { type: 'string', description: 'Terminal command to execute' }
        },
        required: ['ideSessionId', 'command']
      }
    },
    {
      name: 'get_ide_sessions',
      description: 'List all active IDE sessions',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'navigate': {
        const url = args?.url as string;
        const sessionId = args?.sessionId as string || (await createSession()).id;
        const pageId = args?.pageId as string || 'default';
        const waitUntil = args?.waitUntil as any || 'load';

        const page = await getPage(sessionId, pageId);
        await page.goto(url, { waitUntil });

        broadcast({
          type: 'navigation',
          sessionId,
          pageId,
          url,
          title: await page.title()
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              sessionId,
              pageId,
              url,
              title: await page.title()
            })
          }]
        };
      }

      case 'screenshot': {
        const sessionId = args?.sessionId as string;
        const pageId = args?.pageId as string || 'default';
        const fullPage = args?.fullPage as boolean || false;

        const page = await getPage(sessionId, pageId);
        const screenshot = await page.screenshot({ 
          fullPage,
          type: 'png'
        });

        return {
          content: [{
            type: 'text',
            text: `Screenshot taken (${screenshot.length} bytes)`
          }]
        };
      }

      case 'click': {
        const sessionId = args?.sessionId as string;
        const pageId = args?.pageId as string || 'default';
        const selector = args?.selector as string;

        const page = await getPage(sessionId, pageId);
        await page.click(selector);

        broadcast({
          type: 'action',
          sessionId,
          pageId,
          action: 'click',
          selector
        });

        return {
          content: [{
            type: 'text',
            text: `Clicked ${selector}`
          }]
        };
      }

      case 'type': {
        const sessionId = args?.sessionId as string;
        const pageId = args?.pageId as string || 'default';
        const selector = args?.selector as string;
        const text = args?.text as string;

        const page = await getPage(sessionId, pageId);
        await page.fill(selector, text);

        broadcast({
          type: 'action',
          sessionId,
          pageId,
          action: 'type',
          selector,
          text
        });

        return {
          content: [{
            type: 'text',
            text: `Typed into ${selector}`
          }]
        };
      }

      case 'evaluate': {
        const sessionId = args?.sessionId as string;
        const pageId = args?.pageId as string || 'default';
        const script = args?.script as string;

        const page = await getPage(sessionId, pageId);
        const result = await page.evaluate(script);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }

      case 'get_sessions': {
        const sessionList = Array.from(sessions.entries()).map(([id, session]) => ({
          id,
          pages: Array.from(session.pages.keys()),
          createdAt: session.createdAt,
          lastUsed: session.lastUsed
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(sessionList, null, 2)
          }]
        };
      }

      case 'close_session': {
        const sessionId = args?.sessionId as string;
        const session = sessions.get(sessionId);
        
        if (session) {
          await session.context.close();
          sessions.delete(sessionId);
          broadcast({ type: 'session_closed', sessionId });
        }

        return {
          content: [{
            type: 'text',
            text: `Session ${sessionId} closed`
          }]
        };
      }

      case 'create_ide_session': {
        const type = args?.type as 'vscode' | 'browser-dev' | 'terminal' | 'file-explorer';
        const sessionId = args?.sessionId as string;
        const session = sessions.get(sessionId);
        
        if (!session) {
          throw new Error(`Browser session ${sessionId} not found`);
        }

        const ideSession = await ideIntegration.createIDESession(type, session.context);
        
        broadcast({
          type: 'ide_session_created',
          ideSession: {
            id: ideSession.id,
            type: ideSession.type,
            capabilities: ideSession.capabilities
          }
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ideSessionId: ideSession.id,
              type: ideSession.type,
              capabilities: ideSession.capabilities
            }, null, 2)
          }]
        };
      }

      case 'open_vscode': {
        const ideSessionId = args?.ideSessionId as string;
        const projectPath = args?.projectPath as string;
        
        await ideIntegration.openVSCode(ideSessionId, projectPath);
        
        broadcast({
          type: 'vscode_opened',
          ideSessionId,
          projectPath
        });

        return {
          content: [{
            type: 'text',
            text: `VS Code opened in IDE session ${ideSessionId}`
          }]
        };
      }

      case 'navigate_code': {
        const ideSessionId = args?.ideSessionId as string;
        const action = args?.action as string;
        
        const event: CodeNavigationEvent = {
          action: action as any,
          filePath: args?.filePath as string,
          line: args?.line as number,
          column: args?.column as number,
          symbol: args?.symbol as string,
          query: args?.query as string
        };
        
        await ideIntegration.navigateCode(ideSessionId, event);
        
        broadcast({
          type: 'code_navigation',
          ideSessionId,
          event
        });

        return {
          content: [{
            type: 'text',
            text: `Executed code navigation: ${action} in IDE session ${ideSessionId}`
          }]
        };
      }

      case 'capture_ide_state': {
        const ideSessionId = args?.ideSessionId as string;
        const screenshot = await ideIntegration.captureIDEState(ideSessionId);
        
        // Convert to base64 for transport
        const base64Screenshot = screenshot.toString('base64');
        
        broadcast({
          type: 'ide_state_captured',
          ideSessionId,
          timestamp: new Date().toISOString()
        });

        return {
          content: [{
            type: 'text',
            text: `IDE state captured for session ${ideSessionId}`,
          }, {
            type: 'image',
            data: base64Screenshot,
            mimeType: 'image/png'
          }]
        };
      }

      case 'start_recording': {
        const ideSessionId = args?.ideSessionId as string;
        const recordingId = await ideIntegration.startRecording(ideSessionId);
        
        broadcast({
          type: 'recording_started',
          ideSessionId,
          recordingId
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ recordingId, status: 'recording' }, null, 2)
          }]
        };
      }

      case 'stop_recording': {
        const recordingId = args?.recordingId as string;
        const recording = await ideIntegration.stopRecording(recordingId);
        
        broadcast({
          type: 'recording_stopped',
          recordingId,
          frameCount: recording.frames.length,
          duration: recording.endTime ? recording.endTime.getTime() - recording.startTime.getTime() : 0
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              recordingId,
              frameCount: recording.frames.length,
              startTime: recording.startTime,
              endTime: recording.endTime,
              metadata: recording.metadata
            }, null, 2)
          }]
        };
      }

      case 'execute_terminal': {
        const ideSessionId = args?.ideSessionId as string;
        const command = args?.command as string;
        
        const output = await ideIntegration.executeTerminalCommand(ideSessionId, command);
        
        broadcast({
          type: 'terminal_executed',
          ideSessionId,
          command,
          output: output.substring(0, 200) // Truncate for broadcast
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              command,
              output
            }, null, 2)
          }]
        };
      }

      case 'get_ide_sessions': {
        const activeSessions = ideIntegration.getActiveSessions();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(activeSessions.map(session => ({
              id: session.id,
              type: session.type,
              capabilities: session.capabilities,
              lastActivity: session.lastActivity
            })), null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error(`Tool error: ${error}`);
    throw error;
  }
});

// Main startup
async function main() {
  logger.info('Starting Playwright SSE Server...');
  
  // Start Express server
  app.listen(config.port, () => {
    logger.info(`SSE server listening on port ${config.port}`);
  });

  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Set up cleanup interval
  setInterval(cleanupSessions, 60 * 1000); // Every minute
  
  logger.info('Playwright SSE Server ready!');
}

// Error handling
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  
  // Close all sessions
  for (const session of sessions.values()) {
    await session.context.close();
  }
  
  if (browser) {
    await browser.close();
  }
  
  process.exit(0);
});

// Start everything
main().catch((error) => {
  logger.error('Failed to start:', error);
  process.exit(1);
});