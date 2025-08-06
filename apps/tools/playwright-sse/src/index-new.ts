#!/usr/bin/env tsx

/**
 * Playwright SSE Server - Modularized version
 * Persistent browser with Server-Sent Events and MCP integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '@rusty-butter/logger';
import { getPort } from '@rusty-butter/shared';

// Import modular services
import { BrowserManager } from './services/BrowserManager.js';
import { SSEManager } from './services/SSEManager.js';
import { MCPToolHandler } from './services/MCPToolHandler.js';
import { ExpressServer } from './services/ExpressServer.js';
import { IDEIntegration } from './ide-integration.js';

const logger = createLogger('playwright-sse');

// Configuration
const config = {
  port: getPort('playwright-sse'),
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  maxSessions: 10,
  headless: process.env.PLAYWRIGHT_HEADLESS !== 'false'
};

// Initialize services
const sseManager = new SSEManager();
const browserManager = new BrowserManager({
  headless: config.headless,
  sessionTimeout: config.sessionTimeout,
  maxSessions: config.maxSessions
});
const toolHandler = new MCPToolHandler(browserManager, sseManager);
const expressServer = new ExpressServer(config.port, sseManager, browserManager);
const ideIntegration = new IDEIntegration();

// MCP Server setup
const server = new Server(
  {
    name: 'playwright-sse',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const tools = [
  {
    name: 'navigate',
    description: 'Navigate to a URL',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Browser session ID' },
        url: { type: 'string', description: 'URL to navigate to' },
        pageId: { type: 'string', description: 'Page ID (default: "default")' }
      },
      required: ['sessionId', 'url']
    }
  },
  {
    name: 'click',
    description: 'Click an element',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        selector: { type: 'string', description: 'CSS selector' },
        pageId: { type: 'string' }
      },
      required: ['sessionId', 'selector']
    }
  },
  {
    name: 'type',
    description: 'Type text into an element',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        selector: { type: 'string' },
        text: { type: 'string' },
        pageId: { type: 'string' }
      },
      required: ['sessionId', 'selector', 'text']
    }
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        pageId: { type: 'string' },
        fullPage: { type: 'boolean', description: 'Capture full page' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'evaluate',
    description: 'Execute JavaScript in the page',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        script: { type: 'string', description: 'JavaScript to execute' },
        pageId: { type: 'string' }
      },
      required: ['sessionId', 'script']
    }
  },
  {
    name: 'wait_for',
    description: 'Wait for an element to appear',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        selector: { type: 'string' },
        pageId: { type: 'string' },
        timeout: { type: 'number', description: 'Timeout in milliseconds' }
      },
      required: ['sessionId', 'selector']
    }
  },
  {
    name: 'get_content',
    description: 'Get page or element content',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        selector: { type: 'string', description: 'Optional selector for specific element' },
        pageId: { type: 'string' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'create_session',
    description: 'Create a new browser session',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'close_session',
    description: 'Close a browser session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'list_sessions',
    description: 'List active browser sessions',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'fill',
    description: 'Fill a form field',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        selector: { type: 'string' },
        value: { type: 'string' },
        pageId: { type: 'string' }
      },
      required: ['sessionId', 'selector', 'value']
    }
  },
  {
    name: 'press',
    description: 'Press a keyboard key',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        key: { type: 'string', description: 'Key to press (e.g., "Enter", "Tab")' },
        pageId: { type: 'string' }
      },
      required: ['sessionId', 'key']
    }
  },
  {
    name: 'go_back',
    description: 'Navigate back in browser history',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        pageId: { type: 'string' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'go_forward',
    description: 'Navigate forward in browser history',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        pageId: { type: 'string' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'reload',
    description: 'Reload the current page',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        pageId: { type: 'string' }
      },
      required: ['sessionId']
    }
  }
];

// Register MCP handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    let result;
    
    switch (name) {
      case 'navigate':
        result = await toolHandler.handleNavigate(args);
        break;
      case 'click':
        result = await toolHandler.handleClick(args);
        break;
      case 'type':
        result = await toolHandler.handleType(args);
        break;
      case 'screenshot':
        result = await toolHandler.handleScreenshot(args);
        break;
      case 'evaluate':
        result = await toolHandler.handleEvaluate(args);
        break;
      case 'wait_for':
        result = await toolHandler.handleWaitFor(args);
        break;
      case 'get_content':
        result = await toolHandler.handleGetContent(args);
        break;
      case 'create_session':
        result = await toolHandler.handleCreateSession();
        break;
      case 'close_session':
        result = await toolHandler.handleCloseSession(args);
        break;
      case 'list_sessions':
        result = await toolHandler.handleListSessions();
        break;
      case 'fill':
        result = await toolHandler.handleFill(args);
        break;
      case 'press':
        result = await toolHandler.handlePress(args);
        break;
      case 'go_back':
        result = await toolHandler.handleGoBack(args);
        break;
      case 'go_forward':
        result = await toolHandler.handleGoForward(args);
        break;
      case 'reload':
        result = await toolHandler.handleReload(args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    
    return result;
  } catch (error: any) {
    logger.error(`Tool ${name} failed:`, error);
    sseManager.notifyError(`Tool ${name} failed`, error.message);
    
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }]
    };
  }
});

// Main function
async function main() {
  try {
    // Initialize browser manager
    await browserManager.initialize();
    
    // Start Express server
    await expressServer.start();
    logger.info(`HTTP server running on http://localhost:${config.port}`);
    
    // Start heartbeat for SSE connections
    setInterval(() => sseManager.sendHeartbeat(), 30000);
    
    // Initialize IDE integration
    await ideIntegration.initialize();
    
    // Start MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    logger.info('Playwright SSE MCP server started');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await expressServer.stop();
  await browserManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  await expressServer.stop();
  await browserManager.shutdown();
  process.exit(0);
});

// Start the server
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});