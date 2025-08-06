/**
 * HTTP Client for Semantic Memory Service
 */

import { createLogger } from '@rusty-butter/logger';

const logger = createLogger('memory-client');

export interface MemoryClient {
  embed: (content: string, type: string, metadata?: any) => Promise<void>;
  recall: (category: string, query: string, limit?: number) => Promise<any[]>;
  recallRecent: (category: string, limit?: number) => Promise<any[]>;
  search: (query: string, options?: SearchOptions) => Promise<any[]>;
  getStats: () => Promise<any>;
  close: () => Promise<void>;
}

interface SearchOptions {
  limit?: number;
  threshold?: number;
  bank?: string;
}

class SemanticMemoryHTTPClient implements MemoryClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8750') {
    this.baseUrl = baseUrl;
  }

  async embed(content: string, type: string, metadata: any = {}): Promise<void> {
    try {
      const body = JSON.stringify({ content, type, metadata });
      logger.debug(`Embedding to ${this.baseUrl}/embed with type: ${type}, content length: ${content.length}`);
      
      const response = await fetch(`${this.baseUrl}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Embed failed with status ${response.status}: ${errorText}`);
        throw new Error(`Failed to embed: ${response.statusText}`);
      }

      const result = await response.json();
      logger.debug(`Embedded ${type} content: ${content.substring(0, 50)}... Result: ${JSON.stringify(result)}`);
    } catch (error) {
      logger.error('Failed to embed content:', error);
      logger.error('Request details:', { type, contentLength: content.length, metadataKeys: Object.keys(metadata) });
      throw error;
    }
  }

  async recall(category: string, query: string, limit: number = 10): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/recall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          category, 
          query, 
          limit,
          threshold: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to recall: ${response.statusText}`);
      }

      const results = await response.json() as any[];
      logger.debug(`Recalled ${results.length} memories for query: ${query}`);
      return results;
    } catch (error) {
      logger.error('Failed to recall memories:', error);
      return [];
    }
  }

  async recallRecent(category: string, limit: number = 10): Promise<any[]> {
    return this.recall(category, 'recent', limit);
  }

  async search(query: string, options: SearchOptions = {}): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          limit: options.limit || 10,
          threshold: options.threshold || 0.7,
          bank: options.bank || 'all'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to search: ${response.statusText}`);
      }

      const results = await response.json() as any[];
      logger.debug(`Found ${results.length} results for query: ${query}`);
      return results;
    } catch (error) {
      logger.error('Failed to search memories:', error);
      return [];
    }
  }

  async getStats(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/stats`);
      
      if (!response.ok) {
        throw new Error(`Failed to get stats: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('Failed to get stats:', error);
      return { totalEmbeddings: 0, categories: {}, banks: {} };
    }
  }

  async close(): Promise<void> {
    // No-op for HTTP client
    logger.info('Closed memory client connection');
  }
}

/**
 * Initialize memory client
 */
export async function initializeMemory(): Promise<MemoryClient> {
  const url = process.env.SEMANTIC_MEMORY_URL || 'http://localhost:8750';
  
  logger.info(`Connecting to semantic memory at ${url}...`);
  
  const client = new SemanticMemoryHTTPClient(url);
  
  // Test connection
  try {
    const response = await fetch(`${url}/health`);
    if (response.ok) {
      logger.info('Connected to semantic memory!');
    } else {
      logger.warn('Semantic memory service not responding, will retry on first use');
    }
  } catch (error) {
    logger.warn('Semantic memory service not available, will retry on first use');
  }
  
  return client;
}

/**
 * Helper to store monitor state
 */
export async function storeMonitorState(
  memory: MemoryClient,
  monitorName: string,
  state: any
): Promise<void> {
  await memory.embed(
    JSON.stringify(state),
    'monitor-state',
    {
      monitor: monitorName,
      timestamp: new Date().toISOString()
    }
  );
}

/**
 * Helper to recall monitor state on startup
 */
export async function recallMonitorState(
  memory: MemoryClient,
  monitorName: string
): Promise<any> {
  const memories = await memory.recall(
    'monitor-state',
    `monitor ${monitorName} state`,
    1
  );
  
  if (memories.length > 0) {
    try {
      return JSON.parse(memories[0].content);
    } catch {
      return memories[0];
    }
  }
  
  return null;
}