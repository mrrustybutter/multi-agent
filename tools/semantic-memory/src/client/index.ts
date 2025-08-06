import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { LibSQLVector } from '@mastra/libsql';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface SemanticMemoryConfig {
  dbPath: string;
  openAIApiKey?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
}

export interface EmbedItem {
  type: 'chat' | 'code' | 'conversation' | 'document';
  content: string;
  metadata: Record<string, any>;
}

export interface SearchResult {
  content: string;
  metadata: Record<string, any>;
  similarity: number;
}

export interface RecallOptions {
  query: string;
  limit?: number;
  threshold?: number;
  contextWindow?: number;
}

export class SemanticMemoryClient {
  private vectorStores: Map<string, LibSQLVector> = new Map();
  private config: Required<SemanticMemoryConfig>;
  private initialized = false;
  private memoryBanks = ['code', 'chat-history', 'conversations', 'documents', 'general'];

  constructor(config: SemanticMemoryConfig) {
    this.config = {
      dbPath: config.dbPath,
      openAIApiKey: config.openAIApiKey || process.env.OPENAI_API_KEY || '',
      embeddingModel: config.embeddingModel || 'text-embedding-3-small',
      embeddingDimensions: config.embeddingDimensions || 1536,
    };

    if (!this.config.openAIApiKey) {
      throw new Error('OpenAI API key is required for semantic memory');
    }

    // Initialize LibSQL vector store for each memory bank
    for (const bank of this.memoryBanks) {
      this.vectorStores.set(bank, new LibSQLVector({
        connectionUrl: `file:${path.join(this.config.dbPath, bank, 'vectors.db')}`,
      }));
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure database directories exist for all memory banks
    for (const bank of this.memoryBanks) {
      await fs.mkdir(path.join(this.config.dbPath, bank), { recursive: true });
    }

    // Create index for each memory bank if it doesn't exist
    for (const [bank, vectorStore] of this.vectorStores.entries()) {
      try {
        await vectorStore.createIndex({
          indexName: `semantic_memory_${bank.replace('-', '_')}`,
          dimension: this.config.embeddingDimensions,
        });
        console.log(`[SemanticMemory] Created index for bank: ${bank}`);
      } catch (error: any) {
        // Index might already exist, which is fine
        if (!error.message?.includes('already exists')) {
          console.warn(`[SemanticMemory] Index creation warning for ${bank}:`, error.message);
        }
      }
    }

    this.initialized = true;
    console.log(`[SemanticMemory] Initialized with ${this.memoryBanks.length} memory banks at: ${this.config.dbPath}`);
  }

  private getMemoryBank(type: string): string {
    // Map item types to memory banks
    switch (type) {
      case 'chat':
        return 'chat-history';
      case 'code':
        return 'code';
      case 'conversation':
        return 'conversations';
      case 'document':
        return 'documents';
      default:
        return 'general';
    }
  }

  async embed(item: EmbedItem): Promise<void> {
    await this.initialize();

    // Determine which memory bank to use
    const bankName = this.getMemoryBank(item.type);
    const vectorStore = this.vectorStores.get(bankName);
    
    if (!vectorStore) {
      throw new Error(`Memory bank not found: ${bankName}`);
    }

    // Generate embedding
    const { embedding } = await embed({
      model: openai.embedding(this.config.embeddingModel),
      value: item.content,
    });

    // Store in vector database
    await vectorStore.upsert({
      indexName: `semantic_memory_${bankName.replace('-', '_')}`,
      vectors: [embedding],
      metadata: [
        {
          type: item.type,
          content: item.content,
          ...item.metadata,
          embedded_at: new Date().toISOString(),
        },
      ],
      ids: [`${item.type}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`],
    });
  }

  async embedBatch(items: EmbedItem[]): Promise<void> {
    await this.initialize();

    if (items.length === 0) return;

    // Group items by memory bank
    const itemsByBank = new Map<string, EmbedItem[]>();
    for (const item of items) {
      const bankName = this.getMemoryBank(item.type);
      if (!itemsByBank.has(bankName)) {
        itemsByBank.set(bankName, []);
      }
      itemsByBank.get(bankName)!.push(item);
    }

    // Process each bank's items
    for (const [bankName, bankItems] of itemsByBank.entries()) {
      const vectorStore = this.vectorStores.get(bankName);
      if (!vectorStore) continue;

      // Generate embeddings for this bank's items
      const { embeddings } = await embedMany({
        model: openai.embedding(this.config.embeddingModel),
        values: bankItems.map((item) => item.content),
      });

      // Insert all embeddings using batch upsert
      const ids = bankItems.map(
        (item, index) =>
          `${item.type}_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 11)}`
      );
      const metadata = bankItems.map((item) => ({
        type: item.type,
        content: item.content,
        ...item.metadata,
        embedded_at: new Date().toISOString(),
      }));

      await vectorStore.upsert({
        indexName: `semantic_memory_${bankName.replace('-', '_')}`,
        vectors: embeddings,
        metadata,
        ids,
      });
    }
  }

  async search(
    query: string,
    options: { limit?: number; threshold?: number; bank?: string } = {}
  ): Promise<SearchResult[]> {
    await this.initialize();

    const { limit = 10, threshold = 0.7, bank = 'all' } = options;

    // Generate query embedding
    const { embedding } = await embed({
      model: openai.embedding(this.config.embeddingModel),
      value: query,
    });

    // Determine which banks to search
    const banksToSearch = bank === 'all' ? Array.from(this.vectorStores.keys()) : [bank];
    const allResults: SearchResult[] = [];

    // Search each relevant memory bank
    for (const bankName of banksToSearch) {
      const vectorStore = this.vectorStores.get(bankName);
      if (!vectorStore) continue;

      try {
        const results = await vectorStore.query({
          indexName: `semantic_memory_${bankName.replace('-', '_')}`,
          queryVector: embedding,
          topK: limit,
          minScore: threshold,
        });

        // Format and add results
        const formattedResults = results.map((result) => ({
          content: result.metadata?.content || '',
          metadata: { ...result.metadata, bank: bankName },
          similarity: result.score,
        }));
        
        allResults.push(...formattedResults);
      } catch (error) {
        console.warn(`[SemanticMemory] Error searching bank ${bankName}:`, error);
      }
    }

    // Sort by similarity and limit results
    return allResults
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async recall(
    category: string,
    query: string,
    options: Partial<RecallOptions> = {}
  ): Promise<SearchResult[]> {
    await this.initialize();

    const { limit = 10, threshold = 0.7, contextWindow = 3 } = options;

    // Map category to memory bank (category can be a bank name or 'all')
    const bank = this.memoryBanks.includes(category) ? category : category === 'all' ? 'all' : 'general';

    // First, do a semantic search in the appropriate bank
    const results = await this.search(query, { limit: limit * 2, threshold, bank });

    // Filter by category if specified
    const categoryResults =
      category === 'all'
        ? results
        : results.filter((r) => r.metadata.type === category || r.metadata.platform === category);

    // If context window is requested, try to get surrounding context
    if (contextWindow > 0) {
      // For chat messages, try to get surrounding messages by timestamp
      const enhancedResults = await Promise.all(
        categoryResults.slice(0, limit).map(async (result) => {
          if (result.metadata.type === 'chat' && result.metadata.timestamp) {
            const contextResults = await this.getContextualMessages(
              result.metadata.timestamp,
              result.metadata.platform,
              contextWindow
            );
            return {
              ...result,
              context: contextResults,
            };
          }
          return result;
        })
      );
      return enhancedResults;
    }

    return categoryResults.slice(0, limit);
  }

  private async getContextualMessages(
    timestamp: string,
    platform: string,
    windowSize: number
  ): Promise<SearchResult[]> {
    const targetTime = new Date(timestamp);
    const beforeTime = new Date(targetTime.getTime() - windowSize * 60 * 1000); // windowSize minutes before
    const afterTime = new Date(targetTime.getTime() + windowSize * 60 * 1000); // windowSize minutes after

    // This is a simplified context search - in a real implementation,
    // you might want to add more sophisticated temporal queries
    const contextQuery = `messages from ${platform} around ${timestamp}`;
    const contextResults = await this.search(contextQuery, { limit: 20, threshold: 0.5 });

    return contextResults.filter((r) => {
      if (!r.metadata.timestamp) return false;
      const msgTime = new Date(r.metadata.timestamp);
      return msgTime >= beforeTime && msgTime <= afterTime && r.metadata.platform === platform;
    });
  }

  async getStats(): Promise<{ totalEmbeddings: number; categories: Record<string, number>; banks: Record<string, number> }> {
    await this.initialize();

    const categories: Record<string, number> = {};
    const banks: Record<string, number> = {};
    let totalEmbeddings = 0;

    // Get stats for each memory bank
    for (const bankName of this.memoryBanks) {
      try {
        const results = await this.search('', { limit: 10000, threshold: 0, bank: bankName });
        banks[bankName] = results.length;
        totalEmbeddings += results.length;

        // Count by type/category within each bank
        results.forEach((result) => {
          const category = result.metadata.type || 'unknown';
          categories[category] = (categories[category] || 0) + 1;
        });
      } catch (error) {
        console.warn(`[SemanticMemory] Error getting stats for bank ${bankName}:`, error);
        banks[bankName] = 0;
      }
    }

    return {
      totalEmbeddings,
      categories,
      banks,
    };
  }
}
