#!/usr/bin/env tsx

/**
 * Social Media Monitor - Modular MCP Server
 * Monitors Twitter, Reddit, Facebook, Instagram and more
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getMCPLogger, getAgentLogger, createLogger } from '@rusty-butter/logger';
import { SocialMonitor } from './monitor.js';
import { PlatformConfig, MonitorState } from './types.js';

// Logger setup
const mcpLogger = getMCPLogger('social-monitor');
const agentLogger = getAgentLogger('social-monitor');
const logger = createLogger('social-monitor');

// Configuration from environment variables
const config: PlatformConfig = {
  twitter: process.env.X_API_KEY ? {
    apiKey: process.env.X_API_KEY || '',
    apiSecret: process.env.X_API_SECRET_KEY || '',
    accessToken: process.env.X_ACCESS_TOKEN || '',
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET || '',
    bearerToken: process.env.X_BEARER_TOKEN || '',
  } : undefined,
  reddit: process.env.REDDIT_CLIENT_ID ? {
    clientId: process.env.REDDIT_CLIENT_ID || '',
    clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
    userAgent: 'RustyButter:v0.1.0',
  } : undefined,
  facebook: process.env.FACEBOOK_APP_ID ? {
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
    accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
    pageId: process.env.FACEBOOK_PAGE_ID || '',
  } : undefined,
  instagram: process.env.INSTAGRAM_ACCESS_TOKEN ? {
    appId: process.env.INSTAGRAM_APP_ID || '',
    appSecret: process.env.INSTAGRAM_APP_SECRET || '',
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
    accountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
  } : undefined,
  snapchat: process.env.SNAPCHAT_CLIENT_ID ? {
    clientId: process.env.SNAPCHAT_CLIENT_ID || '',
    clientSecret: process.env.SNAPCHAT_CLIENT_SECRET || '',
    redirectUri: process.env.SNAPCHAT_REDIRECT_URI || '',
    accessToken: process.env.SNAPCHAT_ACCESS_TOKEN || '',
  } : undefined,
};

// Initialize the social monitor
const socialMonitor = new SocialMonitor(config);

// Event handlers
socialMonitor.on('social-post', (event) => {
  const taskId = `social-post-${Date.now()}`;
  agentLogger.taskStarted(taskId, `New ${event.platform} post from @${event.data.author.username}`);
  agentLogger.taskCompleted(taskId, Date.now());
});

socialMonitor.on('spawn-claude', (event) => {
  const taskId = `spawn-claude-${Date.now()}`;
  agentLogger.taskStarted(taskId, `Spawning Claude for ${event.platform} response to post ${event.data.post.id}`);
  agentLogger.taskCompleted(taskId, Date.now());
});

// MCP Server setup
const server = new Server(
  {
    name: 'social-monitor',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_status',
        description: 'Get current social monitor status and platform availability',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_recent_posts',
        description: 'Get recent social media posts from all platforms',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of posts to retrieve (default: 10)',
              default: 10,
            },
            platform: {
              type: 'string',
              description: 'Filter by platform (twitter, reddit, instagram, etc.)',
              enum: ['twitter', 'reddit', 'facebook', 'instagram', 'snapchat'],
            },
          },
        },
      },
      {
        name: 'post_message',
        description: 'Post a message to a specific social media platform',
        inputSchema: {
          type: 'object',
          properties: {
            platform: {
              type: 'string',
              description: 'Platform to post to',
              enum: ['twitter', 'reddit', 'facebook', 'instagram', 'snapchat'],
            },
            content: {
              type: 'string',
              description: 'Content to post',
            },
          },
          required: ['platform', 'content'],
        },
      },
      {
        name: 'start_monitoring',
        description: 'Start social media monitoring',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'stop_monitoring',
        description: 'Stop social media monitoring',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();
  
  mcpLogger.toolCalled(name, args);

  try {
    switch (name) {
      case 'get_status':
        const status = socialMonitor.getStatus();
        mcpLogger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2),
            },
          ],
        };

      case 'get_recent_posts':
        const limit = (args as any)?.limit || 10;
        const platform = (args as any)?.platform;
        
        let posts = socialMonitor.getRecentPosts(limit);
        if (platform) {
          posts = posts.filter(post => post.platform === platform);
        }

        mcpLogger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(posts, null, 2),
            },
          ],
        };

      case 'post_message':
        const { platform: postPlatform, content } = args as any;
        
        if (!postPlatform || !content) {
          throw new Error('Platform and content are required');
        }

        await socialMonitor.postToplatform(postPlatform, content);

        mcpLogger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully posted to ${postPlatform}`,
            },
          ],
        };

      case 'start_monitoring':
        await socialMonitor.startMonitoring();
        mcpLogger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [
            {
              type: 'text',
              text: 'Social media monitoring started',
            },
          ],
        };

      case 'stop_monitoring':
        await socialMonitor.stopMonitoring();
        mcpLogger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [
            {
              type: 'text',
              text: 'Social media monitoring stopped',
            },
          ],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    mcpLogger.toolCompleted(name, Date.now() - startTime);
    logger.error(`Tool ${name} failed:`, error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  
  try {
    logger.info('Starting Social Monitor MCP Server...');
    
    // Start monitoring automatically
    await socialMonitor.startMonitoring();
    
    await server.connect(transport);
    logger.info('Social Monitor MCP Server started successfully');
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down Social Monitor...');
  await socialMonitor.stopMonitoring();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down Social Monitor...');
  await socialMonitor.stopMonitoring();
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}