#!/usr/bin/env tsx
/**
 * Semantic Memory MCP SSE Server
 * Provides MCP tools for semantic memory operations via SSE
 */

import express from 'express';
import cors from 'cors';
import { SemanticMemoryClient, EmbedItem } from './client/index.js';
import * as path from 'path';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.SEMANTIC_MEMORY_PORT || 8750;
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const SEMANTIC_MEMORY_DB_PATH =
  process.env.SEMANTIC_MEMORY_DB_PATH || path.join(PROJECT_ROOT, 'semantic_memory_banks');

// Initialize semantic memory client
const semanticMemory = new SemanticMemoryClient({
  dbPath: SEMANTIC_MEMORY_DB_PATH,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Track SSE clients
const sseClients = new Set<express.Response>();

// Initialize on startup
semanticMemory.initialize().then(() => {
  console.log(`[SemanticMemory] Initialized with database at: ${SEMANTIC_MEMORY_DB_PATH}`);
}).catch(error => {
  console.error('[SemanticMemory] Failed to initialize:', error);
  process.exit(1);
});

// MCP SSE endpoint
app.get('/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  sseClients.add(res);
  console.log('[MCP SSE] Client connected');

  // Send initial connection message
  res.write(': MCP SSE semantic-memory server ready\n\n');

  // Heartbeat
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Handle disconnect
  res.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    console.log('[MCP SSE] Client disconnected');
  });
});

// MCP request handler
app.post('/mcp', async (req, res) => {
  const request = req.body;
  console.log('[MCP] Request:', request.method);

  try {
    let response: any;

    switch (request.method) {
      case 'initialize':
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {
                listChanged: false
              }
            },
            serverInfo: {
              name: 'semantic-memory-mcp-server',
              version: '1.0.0'
            }
          }
        };
        break;

      case 'notifications/initialized':
        // No response needed for notifications
        res.status(204).send();
        return;

      case 'tools/list':
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: [
              {
                name: 'embed_text',
                description: 'Embed text content into semantic memory for later retrieval. Choose the appropriate memory bank based on content type.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    content: {
                      type: 'string',
                      description: 'The text content to embed'
                    },
                    bank: {
                      type: 'string',
                      enum: ['code', 'chat-history', 'conversations', 'documents', 'general'],
                      description: `Memory bank to store in:
- 'code': Programming solutions, code snippets, debugging approaches, technical implementations
- 'chat-history': User interactions, preferences, personal context from conversations
- 'conversations': Stream context, ongoing discussions, multi-turn dialogue threads
- 'documents': Project documentation, requirements, design decisions, reference materials
- 'general': General knowledge, facts, miscellaneous information that doesn't fit other categories`
                    },
                    metadata: {
                      type: 'object',
                      description: 'Additional metadata to store with the embedding (source, timestamp, user, etc.)'
                    }
                  },
                  required: ['content', 'bank']
                }
              },
              {
                name: 'semantic_search',
                description: 'Search semantic memory using natural language queries',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'The search query'
                    },
                    limit: {
                      type: 'number',
                      description: 'Maximum number of results to return',
                      default: 10
                    },
                    threshold: {
                      type: 'number',
                      description: 'Minimum similarity threshold (0-1)',
                      default: 0.7
                    },
                    bank: {
                      type: 'string',
                      description: 'Memory bank to search in',
                      default: 'all'
                    }
                  },
                  required: ['query']
                }
              },
              {
                name: 'recall',
                description: 'Recall memories from a specific memory bank with contextual information',
                inputSchema: {
                  type: 'object',
                  properties: {
                    bank: {
                      type: 'string',
                      enum: ['code', 'chat-history', 'conversations', 'documents', 'general', 'all'],
                      description: `Memory bank to search:
- 'code': Search programming solutions and technical implementations
- 'chat-history': Search user interactions and preferences
- 'conversations': Search stream context and ongoing discussions
- 'documents': Search project documentation and requirements
- 'general': Search general knowledge and facts
- 'all': Search across all memory banks`
                    },
                    query: {
                      type: 'string',
                      description: 'What to recall (natural language query)'
                    },
                    limit: {
                      type: 'number',
                      description: 'Maximum number of results',
                      default: 10
                    },
                    threshold: {
                      type: 'number',
                      description: 'Minimum similarity threshold (0-1)',
                      default: 0.7
                    }
                  },
                  required: ['bank', 'query']
                }
              },
              {
                name: 'get_stats',
                description: 'Get statistics about the semantic memory database',
                inputSchema: {
                  type: 'object',
                  properties: {}
                }
              }
            ]
          }
        };
        break;

      case 'tools/call':
        const { name, arguments: args } = request.params;
        
        switch (name) {
          case 'embed_text': {
            const { content, bank, metadata = {} } = args;
            // Map bank to type for the underlying client
            const typeMap: Record<string, string> = {
              'code': 'code',
              'chat-history': 'chat',
              'conversations': 'conversation',
              'documents': 'document',
              'general': 'chat'
            };
            const type = (typeMap[bank] || 'chat') as 'chat' | 'code' | 'conversation' | 'document';
            const item: EmbedItem = { content, type, metadata: { ...metadata, bank } };
            await semanticMemory.embed(item);
            
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: `Successfully embedded to '${bank}' memory bank: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`
                  }
                ]
              }
            };
            break;
          }

          case 'semantic_search': {
            const { query, limit = 10, threshold = 0.7, bank = 'all' } = args;
            const results = await semanticMemory.search(query, { limit, threshold, bank });
            
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(results, null, 2)
                  }
                ]
              }
            };
            break;
          }

          case 'recall': {
            const { bank, query, limit = 10, threshold = 0.7 } = args;
            // Map bank to category for the underlying client
            const categoryMap: Record<string, string> = {
              'code': 'code',
              'chat-history': 'chat',
              'conversations': 'conversation',
              'documents': 'document',
              'general': 'chat',
              'all': 'all'
            };
            const category = categoryMap[bank] || 'all';
            const results = await semanticMemory.recall(category, query, { limit, threshold });
            
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(results, null, 2)
                  }
                ]
              }
            };
            break;
          }

          case 'get_stats': {
            const stats = await semanticMemory.getStats();
            
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(stats, null, 2)
                  }
                ]
              }
            };
            break;
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
        break;

      default:
        throw new Error(`Unknown method: ${request.method}`);
    }

    // Send response to SSE clients
    sseClients.forEach(client => {
      try {
        client.write(`data: ${JSON.stringify(response)}\n\n`);
      } catch (err) {
        sseClients.delete(client);
      }
    });

    res.json(response);
  } catch (error: any) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: error.message || 'Internal server error'
      }
    };

    res.json(errorResponse);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    dbPath: SEMANTIC_MEMORY_DB_PATH,
    sseClients: sseClients.size 
  });
});

// Direct HTTP API endpoints (for compatibility)
app.post('/embed', async (req, res) => {
  try {
    const { content, type, metadata = {} } = req.body;
    
    if (!content || !type) {
      return res.status(400).json({ error: 'Content and type are required' });
    }
    
    const item: EmbedItem = { content, type, metadata };
    await semanticMemory.embed(item);
    
    res.json({ 
      success: true, 
      message: `Embedded ${type} content`,
      length: content.length 
    });
  } catch (error) {
    console.error('[SemanticMemory] Embed error:', error);
    res.status(500).json({ error: 'Failed to embed content' });
  }
});

app.post('/search', async (req, res) => {
  try {
    const { query, limit = 10, threshold = 0.7, bank = 'all' } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const results = await semanticMemory.search(query, { limit, threshold, bank });
    
    res.json(results);
  } catch (error) {
    console.error('[SemanticMemory] Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.post('/recall', async (req, res) => {
  try {
    const { category, query, limit = 10, threshold = 0.7, contextWindow = 3 } = req.body;
    
    if (!category || !query) {
      return res.status(400).json({ error: 'Category and query are required' });
    }
    
    const results = await semanticMemory.recall(category, query, {
      limit,
      threshold,
      contextWindow
    });
    
    res.json(results);
  } catch (error) {
    console.error('[SemanticMemory] Recall error:', error);
    res.status(500).json({ error: 'Recall failed' });
  }
});

app.get('/stats', async (req, res) => {
  try {
    const stats = await semanticMemory.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[SemanticMemory] Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[SemanticMemory] MCP SSE Server running on port ${PORT}`);
  console.log(`[SemanticMemory] MCP SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`[SemanticMemory] MCP requests: http://localhost:${PORT}/mcp`);
  console.log(`[SemanticMemory] Health check: http://localhost:${PORT}/health`);
  console.log(`[SemanticMemory] Direct API available at: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[SemanticMemory] Shutting down server...');
  process.exit(0);
});