#!/usr/bin/env node
/**
 * Semantic Memory HTTP Server
 * Provides a simple HTTP API for semantic memory operations
 */

import express from 'express';
import { SemanticMemoryClient, EmbedItem } from './client/index.js';
import * as path from 'path';

const app = express();
app.use(express.json());

const PORT = process.env.SEMANTIC_MEMORY_PORT || 8750;
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const SEMANTIC_MEMORY_DB_PATH =
  process.env.SEMANTIC_MEMORY_DB_PATH || path.join(PROJECT_ROOT, 'semantic_memory_banks');

// Initialize semantic memory client
const semanticMemory = new SemanticMemoryClient({
  dbPath: SEMANTIC_MEMORY_DB_PATH,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Initialize on startup
semanticMemory.initialize().then(() => {
  console.log(`[SemanticMemory] Initialized with database at: ${SEMANTIC_MEMORY_DB_PATH}`);
}).catch(error => {
  console.error('[SemanticMemory] Failed to initialize:', error);
  process.exit(1);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', dbPath: SEMANTIC_MEMORY_DB_PATH });
});

// Embed text
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

// Batch embed
app.post('/embed-batch', async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Items array is required' });
    }
    
    await semanticMemory.embedBatch(items);
    
    res.json({ 
      success: true, 
      message: `Embedded ${items.length} items` 
    });
  } catch (error) {
    console.error('[SemanticMemory] Batch embed error:', error);
    res.status(500).json({ error: 'Failed to embed batch' });
  }
});

// Search
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

// Recall
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

// Get stats
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
  console.log(`[SemanticMemory] HTTP API server running on port ${PORT}`);
});