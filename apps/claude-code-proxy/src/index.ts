#!/usr/bin/env tsx

/**
 * Claude Code Proxy - Routes Claude Code instances to different LLM providers
 * Allows using OpenAI, Gemini, Grok, and other models through the Anthropic API interface
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { IncomingMessage, ServerResponse } from 'http';
import { ClientRequest } from 'http';
import { getLogger } from '@rusty-butter/logger';
import path from 'path';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig({ path: path.join(process.cwd(), '../../.env') });

const logger = getLogger('claude-code-proxy');

// Types
interface LLMProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  transformRequest?: (req: Request) => void;
  transformResponse?: (res: Response) => void;
}

interface ProxyConfig {
  port: number;
  providers: Map<string, LLMProvider>;
  defaultProvider: string;
}

// Configuration
const PROVIDER = process.env.PROVIDER || 'openai'; // Which provider this instance handles
const config: ProxyConfig = {
  port: parseInt(process.env.PORT || process.env.CLAUDE_PROXY_PORT || '8743'),
  providers: new Map(),
  defaultProvider: PROVIDER
};

// Initialize LLM providers
function initializeProviders() {
  // Anthropic (Claude)
  if (process.env.ANTHROPIC_API_KEY) {
    config.providers.set('anthropic', {
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: process.env.ANTHROPIC_API_KEY,
      models: ['claude-3-opus-20240229', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307']
    });
  }

  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    config.providers.set('openai', {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY,
      models: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo'],
      transformRequest: transformOpenAIRequest,
      transformResponse: transformOpenAIResponse
    });
  }

  // Google Gemini
  if (process.env.GEMINI_API_KEY) {
    config.providers.set('gemini', {
      name: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: process.env.GEMINI_API_KEY,
      models: ['gemini-1.5-flash-002', 'gemini-1.5-pro'],
      transformRequest: transformGeminiRequest,
      transformResponse: transformGeminiResponse
    });
  }

  // Grok (via X.AI)
  if (process.env.GROK_API_KEY) {
    config.providers.set('grok', {
      name: 'Grok',
      baseUrl: 'https://api.x.ai/v1',
      apiKey: process.env.GROK_API_KEY,
      models: ['grok-beta'],
      transformRequest: transformOpenAIRequest, // Grok uses OpenAI-compatible API
      transformResponse: transformOpenAIResponse
    });
  }

  // Groq (fast inference)
  if (process.env.GROQ_API_KEY) {
    config.providers.set('groq', {
      name: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
      models: ['mixtral-8x7b-32768', 'llama2-70b-4096'],
      transformRequest: transformOpenAIRequest,
      transformResponse: transformOpenAIResponse
    });
  }

  // OpenRouter (access to multiple models)
  if (process.env.OPENROUTER_API_KEY) {
    config.providers.set('openrouter', {
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      models: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4-turbo', 'google/gemini-pro'],
      transformRequest: transformOpenAIRequest,
      transformResponse: transformOpenAIResponse
    });
  }

  // Cerebras (ultra-fast inference)
  if (process.env.CEREBRAS_API_KEY) {
    config.providers.set('cerebras', {
      name: 'Cerebras',
      baseUrl: 'https://api.cerebras.ai/v1',
      apiKey: process.env.CEREBRAS_API_KEY,
      models: ['cerebras-llama3.1-8b', 'cerebras-llama3.1-70b'],
      transformRequest: transformOpenAIRequest,
      transformResponse: transformOpenAIResponse
    });
  }

  logger.info(`Initialized ${config.providers.size} LLM providers`);
  config.providers.forEach((provider, key) => {
    logger.info(`  - ${provider.name} (${key}): ${provider.models.join(', ')}`);
  });
}

// Transform OpenAI-style request to Anthropic format
function transformOpenAIRequest(req: Request): void {
  if (req.body && req.body.messages) {
    // Convert OpenAI messages format to Anthropic format
    const messages = req.body.messages;
    let system = '';
    const anthropicMessages = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content;
      } else {
        anthropicMessages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        });
      }
    }

    req.body = {
      model: req.body.model,
      messages: anthropicMessages,
      system: system,
      max_tokens: req.body.max_tokens || 4096,
      temperature: req.body.temperature || 0.7
    };
  }
}

// Transform OpenAI-style response to Anthropic format
function transformOpenAIResponse(res: Response): void {
  // This would need to intercept and transform the response
  // Implementation depends on the specific response format
}

// Transform Gemini request format
function transformGeminiRequest(req: Request): void {
  if (req.body && req.body.messages) {
    // Transform to Gemini's format
    const contents = req.body.messages.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    req.body = {
      contents,
      generationConfig: {
        temperature: req.body.temperature || 0.7,
        maxOutputTokens: req.body.max_tokens || 4096
      }
    };
  }
}

// Transform Gemini response format
function transformGeminiResponse(res: Response): void {
  // Transform Gemini response to Anthropic format
}

class ClaudeCodeProxy {
  private app: express.Application;
  private proxies: Map<string, any> = new Map();

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupProxies();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    
    // Log requests
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.debug(`${req.method} ${req.path}`, {
        provider: req.headers['x-llm-provider'],
        model: req.headers['x-llm-model']
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        providers: Array.from(config.providers.keys()),
        uptime: process.uptime()
      });
    });

    // List available providers and models
    this.app.get('/providers', (req: Request, res: Response) => {
      const providers: any = {};
      config.providers.forEach((provider, key) => {
        providers[key] = {
          name: provider.name,
          models: provider.models,
          baseUrl: provider.baseUrl
        };
      });
      res.json(providers);
    });

    // Get provider info
    this.app.get('/provider/:name', (req: Request, res: Response) => {
      const provider = config.providers.get(req.params.name);
      if (!provider) {
        return res.status(404).json({ error: 'Provider not found' });
      }
      res.json({
        name: provider.name,
        models: provider.models,
        available: true
      });
    });
  }

  private setupProxies(): void {
    // Create proxy middleware for each provider
    config.providers.forEach((provider, key) => {
      const proxyOptions: Options = {
        target: provider.baseUrl,
        changeOrigin: true,
        on: {
          proxyReq: (proxyReq: ClientRequest, req: IncomingMessage, res: ServerResponse) => {
            // Use the provider's actual API key, not the one from Claude
            proxyReq.setHeader('Authorization', `Bearer ${provider.apiKey}`);
            proxyReq.setHeader('Content-Type', 'application/json');
            
            // Apply request transformation if needed
            if (provider.transformRequest) {
              provider.transformRequest(req as Request);
            }
            
            // Log the proxied request
            logger.info(`Proxying to ${provider.name}: ${(req as any).method} ${(req as any).path}`);
          },
          proxyRes: (proxyRes: IncomingMessage, req: IncomingMessage, res: ServerResponse) => {
            // Apply response transformation if needed
            if (provider.transformResponse) {
              provider.transformResponse(res as Response);
            }
          },
          error: (err: Error, req: IncomingMessage, res: ServerResponse | any) => {
            logger.error(`Proxy error for ${provider.name}:`, err);
            if (res && typeof res.writeHead === 'function') {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'Proxy error',
                message: err.message,
                provider: provider.name
              }));
            }
          }
        }
      };

      this.proxies.set(key, createProxyMiddleware(proxyOptions));
    });

    // Main proxy endpoint - routes to configured provider
    this.app.use('/v1/*', (req: Request, res: Response, next: NextFunction) => {
      // This proxy instance handles only the configured provider
      const providerName = config.defaultProvider;
      
      logger.info(`Routing to provider: ${providerName} for ${req.path}`);
      
      const proxy = this.proxies.get(providerName);
      const provider = config.providers.get(providerName);

      if (!proxy || !provider) {
        return res.status(400).json({
          error: 'Invalid provider',
          message: `Provider '${providerName}' not configured`,
          available: Array.from(config.providers.keys())
        });
      }

      // Authorization is already set by Claude with ANTHROPIC_API_KEY

      // Use the appropriate proxy
      proxy(req, res, next);
    });

    // Anthropic-compatible endpoint
    this.app.use('/anthropic/*', (req: Request, res: Response, next: NextFunction) => {
      const proxy = this.proxies.get('anthropic');
      if (!proxy) {
        return res.status(503).json({ error: 'Anthropic provider not configured' });
      }
      proxy(req, res, next);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(config.port, () => {
        logger.info(`Claude Code Proxy listening on port ${config.port}`);
        logger.info(`Default provider: ${config.defaultProvider}`);
        resolve();
      });
    });
  }
}

// Main startup
async function main() {
  logger.info('Starting Claude Code Proxy...');
  
  // Initialize providers
  initializeProviders();

  if (config.providers.size === 0) {
    logger.error('No LLM providers configured! Please set API keys in .env');
    process.exit(1);
  }

  // Start proxy server
  const proxy = new ClaudeCodeProxy();
  await proxy.start();

  logger.info(`Claude Code Proxy is ready for provider: ${PROVIDER}`);
  logger.info('Usage:');
  logger.info(`  Set ANTHROPIC_BASE_URL=http://localhost:${config.port}/v1`);
  logger.info(`  Set ANTHROPIC_API_KEY=${PROVIDER.toUpperCase()}_API_KEY from environment`);
}

// Handle shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down Claude Code Proxy...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down Claude Code Proxy...');
  process.exit(0);
});

// Error handling
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

// Start
main().catch((error) => {
  logger.error('Failed to start Claude Code Proxy:', error);
  process.exit(1);
});