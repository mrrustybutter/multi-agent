/**
 * Memory Search and Management Routes
 * Provides Google-like search functionality for semantic memory
 */

import { Router, Request, Response } from 'express';
import { getLogger } from '@rusty-butter/logger';
import { initializeMemory, MemoryClient } from '@rusty-butter/shared';

const router: Router = Router();
const logger = getLogger('memory-routes');

let memoryClient: MemoryClient | null = null;

// Initialize memory client on startup
initializeMemory().then(client => {
  memoryClient = client;
  logger.info('✅ Memory client initialized for search routes');
}).catch(error => {
  logger.error('❌ Failed to initialize memory client:', error);
});

// Memory banks configuration - mapped to semantic-memory categories
const MEMORY_BANKS = [
  { id: 'code', name: 'Code Knowledge', icon: '💻', description: 'Programming solutions, code patterns, debugging', category: 'code' },
  { id: 'chat-history', name: 'User Interactions', icon: '👤', description: 'User preferences, conversation history', category: 'chat' },
  { id: 'documents', name: 'Project Context', icon: '📁', description: 'Project requirements, architecture decisions', category: 'document' },
  { id: 'conversations', name: 'Streaming Context', icon: '🎥', description: 'Stream events, viewer interactions', category: 'conversation' },
  { id: 'general', name: 'General Knowledge', icon: '🧠', description: 'General information and facts', category: 'general' }
];

/**
 * Search semantic memory with Google-like interface (GET)
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q: query, bank, limit = 20, offset = 0 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    
    if (!memoryClient) {
      return res.status(503).json({ error: 'Memory service unavailable' });
    }
    
    logger.info(`🔍 Searching memory: "${query}" in bank: ${bank || 'all'}`);
    
    // Search across specified bank or all banks
    const banksToSearch = bank ? [bank as string] : MEMORY_BANKS.map(b => b.id);
    const allResults: any[] = [];
    
    for (const bankId of banksToSearch) {
      try {
        const bank = MEMORY_BANKS.find(b => b.id === bankId);
        const category = bank?.category || bankId;
        
        const results = await memoryClient.recall(
          category,
          query as string,
          Math.min(Number(limit), 50) // Cap at 50 results per bank
        );
        
        // Add bank metadata to each result
        const enhancedResults = results.map((result: any) => ({
          ...result,
          bank: bankId,
          bankInfo: MEMORY_BANKS.find(b => b.id === bankId),
          relevance: result.similarity || result.score || 0.5,
          id: `${bankId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }));
        
        allResults.push(...enhancedResults);
      } catch (error) {
        logger.warn(`⚠️ Failed to search bank ${bankId}:`, error);
      }
    }
    
    // Sort by relevance score
    allResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    
    // Apply pagination
    const paginatedResults = allResults.slice(Number(offset), Number(offset) + Number(limit));
    
    // Find related memories for top results
    const resultsWithRelated = await Promise.all(
      paginatedResults.slice(0, 10).map(async (result) => {
        try {
          // Search for related content using key terms from the result
          const keyTerms = extractKeyTerms(result.content);
          const relatedResults = await searchRelated(memoryClient!, result.bank, keyTerms, result.id);
          
          return {
            ...result,
            related: relatedResults.slice(0, 3) // Top 3 related memories
          };
        } catch (error) {
          return { ...result, related: [] };
        }
      })
    );
    
    // Add empty related arrays for remaining results
    const remainingResults = paginatedResults.slice(10).map(r => ({ ...r, related: [] }));
    
    res.json({
      query: query as string,
      totalResults: allResults.length,
      results: [...resultsWithRelated, ...remainingResults],
      banks: banksToSearch,
      offset: Number(offset),
      limit: Number(limit),
      searchTime: Date.now()
    });
    
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({ error: 'Search failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * Search semantic memory with POST (for ToolCallHandler)
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, bank, limit = 20, offset = 0 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    
    if (!memoryClient) {
      return res.status(503).json({ error: 'Memory service unavailable' });
    }
    
    logger.info(`🔍 Searching memory via POST: "${query}" in bank: ${bank || 'all'}`);
    
    // Search across specified bank or all banks
    const banksToSearch = bank ? [bank as string] : MEMORY_BANKS.map(b => b.id);
    const allResults: any[] = [];
    
    for (const bankId of banksToSearch) {
      try {
        const bank = MEMORY_BANKS.find(b => b.id === bankId);
        const category = bank?.category || bankId;
        
        const results = await memoryClient.recall(
          category,
          query as string,
          Math.min(Number(limit), 50) // Cap at 50 results per bank
        );
        
        // Add bank metadata to each result
        const enhancedResults = results.map((result: any) => ({
          ...result,
          bank: bankId,
          bankInfo: MEMORY_BANKS.find(b => b.id === bankId),
          relevance: result.similarity || result.score || 0.5,
          id: `${bankId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }));
        
        allResults.push(...enhancedResults);
      } catch (error) {
        logger.warn(`⚠️ Failed to search bank ${bankId}:`, error);
      }
    }
    
    // Sort by relevance score
    allResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    
    // Apply pagination
    const paginatedResults = allResults.slice(Number(offset), Number(offset) + Number(limit));
    
    // Return simplified results for tool calling
    const simplifiedResults = paginatedResults.map(result => ({
      content: result.content || result.text || '',
      relevance: result.relevance || 0,
      bank: result.bank,
      timestamp: result.metadata?.timestamp || result.timestamp
    }));
    
    // Return array directly for ToolCallHandler compatibility
    res.json(simplifiedResults);
    
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({ error: 'Search failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * Get detailed memory by ID
 */
router.get('/memory/:bank/:id', async (req: Request, res: Response) => {
  try {
    const { bank, id } = req.params;
    
    if (!memoryClient) {
      return res.status(503).json({ error: 'Memory service unavailable' });
    }
    
    // Since we generate IDs, we need to search by content similarity
    // In a real implementation, we'd store and retrieve by actual ID
    const results = await memoryClient.recall(bank, id, 1);
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Memory not found' });
    }
    
    const memory = results[0];
    
    // Get related memories
    const keyTerms = extractKeyTerms(memory.content);
    const related = await searchRelated(memoryClient, bank, keyTerms, id);
    
    res.json({
      ...memory,
      bank,
      bankInfo: MEMORY_BANKS.find(b => b.id === bank),
      related: related.slice(0, 5),
      retrievedAt: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Memory retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve memory' });
  }
});

/**
 * Get memory bank statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Return hardcoded stats if memory client is not available
    if (!memoryClient) {
      const hardcodedStats = MEMORY_BANKS.map(bank => ({
        ...bank,
        totalMemories: 0,
        recentActivity: null,
        topKeywords: [],
        averageLength: 0,
        status: 'ready'
      }));
      
      return res.json({
        banks: hardcodedStats,
        totalMemories: 0,
        activeBanks: hardcodedStats.length,
        lastUpdated: new Date().toISOString()
      });
    }
    
    const stats = await Promise.all(
      MEMORY_BANKS.map(async (bank) => {
        try {
          // Get recent memories to estimate bank size using correct category
          const recentMemories = await memoryClient!.recallRecent(bank.category, 100);
          
          // Get sample for analysis
          const sample = recentMemories.slice(0, 10);
          
          return {
            ...bank,
            totalMemories: recentMemories.length, // This is an estimate
            recentActivity: recentMemories.length > 0 ? recentMemories[0].metadata?.timestamp : null,
            topKeywords: extractTopKeywords(sample),
            averageLength: sample.reduce((acc, m) => acc + (m.content?.length || 0), 0) / (sample.length || 1),
            status: 'active'
          };
        } catch (error) {
          logger.warn(`Failed to get stats for bank ${bank.id}:`, error);
          return {
            ...bank,
            totalMemories: 0,
            recentActivity: null,
            topKeywords: [],
            averageLength: 0,
            status: 'ready'
          };
        }
      })
    );
    
    res.json({
      banks: stats,
      totalMemories: stats.reduce((acc, s) => acc + s.totalMemories, 0),
      activeBanks: stats.filter(s => s.status === 'active').length,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get memory statistics' });
  }
});

/**
 * Store new memory
 */
router.post('/embed', async (req: Request, res: Response) => {
  try {
    const { content, bank = 'general-knowledge', metadata = {} } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }
    
    if (!memoryClient) {
      return res.status(503).json({ error: 'Memory service unavailable' });
    }
    
    await memoryClient.embed(content, bank, {
      ...metadata,
      source: 'dashboard',
      timestamp: new Date().toISOString(),
      manual: true
    });
    
    logger.info(`✅ Embedded memory in bank: ${bank}`);
    
    res.json({
      success: true,
      bank,
      contentLength: content.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Embed error:', error);
    res.status(500).json({ error: 'Failed to store memory' });
  }
});

// Helper functions

function extractKeyTerms(content: string): string[] {
  if (!content) return [];
  
  // Extract important terms (simple implementation)
  const words = content.toLowerCase().split(/\s+/);
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'was', 'are', 'were']);
  
  const terms = words
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 5);
  
  return terms;
}

async function searchRelated(client: MemoryClient, bank: string, terms: string[], excludeId?: string): Promise<any[]> {
  if (terms.length === 0) return [];
  
  try {
    const results = await client.recall(bank, terms.join(' '), 5);
    // Filter out the current memory if ID provided
    return results.filter((r: any) => r.id !== excludeId);
  } catch (error) {
    logger.debug('Related search failed:', error);
    return [];
  }
}

function extractTopKeywords(memories: any[]): string[] {
  const wordCounts = new Map<string, number>();
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'was', 'are', 'were']);
  
  for (const memory of memories) {
    if (!memory.content) continue;
    
    const words = memory.content.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && !stopWords.has(word)) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }
  }
  
  // Sort by frequency and return top 10
  return Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

export default router;