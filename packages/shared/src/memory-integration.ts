/**
 * Semantic Memory Integration for Multi-Agent System
 * Provides easy memory storage and recall for all monitors
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '@rusty-butter/logger';

const logger = createLogger('memory-integration');

export interface MemoryClient {
  embed: (content: string, type: string, metadata?: any) => Promise<void>;
  recall: (category: string, query: string, limit?: number) => Promise<any[]>;
  recallRecent: (category: string, limit?: number) => Promise<any[]>;
  close: () => Promise<void>;
}

let memoryClient: Client | null = null;
let memoryTransport: StdioClientTransport | null = null;

/**
 * Initialize connection to semantic memory MCP server
 */
export async function initializeMemory(): Promise<MemoryClient> {
  try {
    logger.info('Connecting to semantic memory MCP server...');
    
    memoryTransport = new StdioClientTransport({
      command: 'node',
      args: [`${process.cwd()}/tools/semantic-memory/dist/index.js`],
      env: {
        ...process.env,
        SEMANTIC_MEMORY_DB_PATH: `${process.cwd()}/semantic_memory_banks`
      }
    });

    memoryClient = new Client({
      name: 'memory-integration-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await memoryClient.connect(memoryTransport);
    logger.info('Connected to semantic memory!');

    return {
      embed: async (content: string, type: string, metadata?: any) => {
        if (!memoryClient) throw new Error('Memory not initialized');
        
        await memoryClient.request({
          method: 'tools/call',
          params: {
            name: 'embed_text',
            arguments: {
              content,
              type,
              metadata
            }
          }
        }, CallToolResultSchema);
        
        logger.debug(`Embedded ${type} content: ${content.substring(0, 50)}...`);
      },

      recall: async (category: string, query: string, limit: number = 10) => {
        if (!memoryClient) throw new Error('Memory not initialized');
        
        const result = await memoryClient.request({
          method: 'tools/call',
          params: {
            name: 'recall',
            arguments: {
              category,
              query,
              limit,
              threshold: 0.3
            }
          }
        }, CallToolResultSchema);
        
        logger.debug(`Recalled ${limit} memories for query: ${String(query)}`);
        return result?.content?.[0]?.text ? JSON.parse(result.content[0].text as string) : [];
      },

      recallRecent: async (category: string, limit: number = 10) => {
        if (!memoryClient) throw new Error('Memory not initialized');
        
        const result = await memoryClient.request({
          method: 'tools/call',
          params: {
            name: 'recall',
            arguments: {
              category,
              query: 'recent',
              limit,
              threshold: 0.1,
              contextWindow: 30 // 30 minutes of context
            }
          }
        }, CallToolResultSchema);
        
        logger.debug(`Recalled ${limit} recent memories from category: ${String(category)}`);
        return result?.content?.[0]?.text ? JSON.parse(result.content[0].text as string) : [];
      },

      close: async () => {
        if (memoryClient && memoryTransport) {
          await memoryClient.close();
          await memoryTransport.close();
          memoryClient = null;
          memoryTransport = null;
          logger.info('Disconnected from semantic memory');
        }
      }
    };
  } catch (error) {
    logger.error('Failed to connect to semantic memory:', error);
    throw error;
  }
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