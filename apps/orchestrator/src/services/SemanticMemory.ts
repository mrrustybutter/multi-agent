/**
 * Semantic Memory Service
 * In-memory vector store for semantic search
 */

import { getLogger } from '@rusty-butter/logger';
import crypto from 'crypto';

const logger = getLogger('semantic-memory');

interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata: any;
  timestamp: string;
  bank: string;
}

interface MemoryBank {
  id: string;
  name: string;
  description: string;
  entries: Map<string, MemoryEntry>;
}

export class SemanticMemoryService {
  private banks: Map<string, MemoryBank> = new Map();
  private initialized = false;

  constructor() {
    this.initializeMemoryBanks();
  }

  private initializeMemoryBanks() {
    const bankConfigs = [
      { id: 'code-knowledge', name: 'Code Knowledge', description: 'Programming solutions, code patterns, debugging' },
      { id: 'user-interactions', name: 'User Interactions', description: 'User preferences, conversation history' },
      { id: 'project-context', name: 'Project Context', description: 'Project requirements, architecture decisions' },
      { id: 'streaming-context', name: 'Streaming Context', description: 'Stream events, viewer interactions' },
      { id: 'general-knowledge', name: 'General Knowledge', description: 'General information and facts' }
    ];

    for (const config of bankConfigs) {
      this.banks.set(config.id, {
        ...config,
        entries: new Map()
      });
    }

    this.initialized = true;
    logger.info(`✅ Initialized ${this.banks.size} memory banks`);
  }

  /**
   * Generate a simple embedding for text (placeholder for real embeddings)
   */
  private generateEmbedding(text: string): number[] {
    // Simple hash-based pseudo-embedding for demo purposes
    // In production, use OpenAI embeddings or similar
    const hash = crypto.createHash('sha256').update(text.toLowerCase()).digest();
    const embedding: number[] = [];
    for (let i = 0; i < 128; i++) {
      embedding.push(hash[i % hash.length] / 255);
    }
    return embedding;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Simple text similarity for fallback (when embeddings aren't available)
   */
  private textSimilarity(query: string, text: string): number {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    // Exact match
    if (textLower.includes(queryLower)) {
      return 0.9 + (queryLower.length / textLower.length) * 0.1;
    }
    
    // Word overlap
    const queryWords = queryLower.split(/\s+/);
    const textWords = textLower.split(/\s+/);
    const commonWords = queryWords.filter(word => textWords.includes(word));
    
    if (commonWords.length > 0) {
      return commonWords.length / Math.max(queryWords.length, textWords.length);
    }
    
    return 0;
  }

  /**
   * Store a memory in the specified bank
   */
  async embed(content: string, bankId: string, metadata: any = {}): Promise<string> {
    if (!this.initialized) {
      throw new Error('Semantic memory not initialized');
    }

    const bank = this.banks.get(bankId) || this.banks.get('general-knowledge');
    if (!bank) {
      throw new Error(`Memory bank not found: ${bankId}`);
    }

    const id = `${bankId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const embedding = this.generateEmbedding(content);
    
    const entry: MemoryEntry = {
      id,
      content,
      embedding,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      bank: bankId
    };

    bank.entries.set(id, entry);
    logger.info(`💾 Stored memory in bank '${bankId}': ${content.substring(0, 50)}...`);
    
    return id;
  }

  /**
   * Search for memories using semantic similarity
   */
  async recall(bankId: string, query: string, limit: number = 10): Promise<any[]> {
    if (!this.initialized) {
      throw new Error('Semantic memory not initialized');
    }

    const bank = this.banks.get(bankId);
    if (!bank) {
      logger.warn(`Memory bank not found: ${bankId}`);
      return [];
    }

    const queryEmbedding = this.generateEmbedding(query);
    const results: Array<{ entry: MemoryEntry; similarity: number }> = [];

    // Calculate similarity for each entry
    for (const entry of bank.entries.values()) {
      let similarity = 0;
      
      if (entry.embedding) {
        // Use embedding similarity if available
        similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
      } else {
        // Fallback to text similarity
        similarity = this.textSimilarity(query, entry.content);
      }

      if (similarity > 0.1) { // Threshold
        results.push({ entry, similarity });
      }
    }

    // Sort by similarity and return top results
    results.sort((a, b) => b.similarity - a.similarity);
    
    const topResults = results.slice(0, limit).map(r => ({
      id: r.entry.id,
      content: r.entry.content,
      similarity: r.similarity,
      metadata: r.entry.metadata,
      timestamp: r.entry.timestamp,
      bank: r.entry.bank
    }));

    logger.info(`🔍 Found ${topResults.length} memories for query "${query}" in bank '${bankId}'`);
    return topResults;
  }

  /**
   * Get recent memories from a bank
   */
  async recallRecent(bankId: string, limit: number = 10): Promise<any[]> {
    if (!this.initialized) {
      throw new Error('Semantic memory not initialized');
    }

    const bank = this.banks.get(bankId);
    if (!bank) {
      logger.warn(`Memory bank not found: ${bankId}`);
      return [];
    }

    // Get all entries and sort by timestamp
    const entries = Array.from(bank.entries.values());
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const results = entries.slice(0, limit).map(entry => ({
      id: entry.id,
      content: entry.content,
      metadata: entry.metadata,
      timestamp: entry.timestamp,
      bank: entry.bank
    }));

    logger.info(`📚 Retrieved ${results.length} recent memories from bank '${bankId}'`);
    return results;
  }

  /**
   * Get statistics for all memory banks
   */
  getStats(): any {
    const stats = [];
    
    for (const [id, bank] of this.banks) {
      const entries = Array.from(bank.entries.values());
      const recentEntry = entries.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];

      stats.push({
        id,
        name: bank.name,
        description: bank.description,
        totalMemories: bank.entries.size,
        recentActivity: recentEntry?.timestamp || null,
        oldestMemory: entries[entries.length - 1]?.timestamp || null
      });
    }

    return stats;
  }

  /**
   * Clear a memory bank
   */
  clearBank(bankId: string): void {
    const bank = this.banks.get(bankId);
    if (bank) {
      bank.entries.clear();
      logger.info(`🗑️ Cleared memory bank '${bankId}'`);
    }
  }

  /**
   * Get all memory banks
   */
  getBanks(): Array<{ id: string; name: string; description: string }> {
    return Array.from(this.banks.values()).map(bank => ({
      id: bank.id,
      name: bank.name,
      description: bank.description
    }));
  }
}

// Singleton instance
export const semanticMemory = new SemanticMemoryService();