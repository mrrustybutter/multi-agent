#!/usr/bin/env node

/**
 * Test the fixed orchestrator with proper Claude CLI flags
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a test message that should trigger Claude
const testMessage = {
  id: `fixed-test-${Date.now()}`,
  timestamp: new Date().toISOString(),
  source: 'fixed-orchestrator-test',
  priority: 'high',
  action: {
    type: 'social-respond',
    content: 'Test the fixed orchestrator CLI flags',
    data: {
      post: {
        id: 'fixed123',
        platform: 'twitter',
        author: {
          username: 'rustybutter',
          displayName: 'Rusty Butter'
        },
        content: 'Testing the orchestrator with proper Claude CLI flags! Can you respond?',
        timestamp: new Date().toISOString(),
        url: 'https://twitter.com/rustybutter/status/fixed123'
      },
      action: 'respond',
      context: 'Testing fixed orchestrator'
    }
  },
  context: {
    platform: 'twitter',
    requires_response: true,
    mention: true
  },
  ttl: 300
};

// Clean up old test files first
const queueDir = path.join(__dirname, 'orchestrator', 'queues', 'action');
const files = fs.readdirSync(queueDir);
for (const file of files) {
  if (file.includes('test') || file.includes('fixed')) {
    fs.unlinkSync(path.join(queueDir, file));
    console.log(`🗑️ Cleaned up: ${file}`);
  }
}

// Create new test file
const filename = `${testMessage.id}.json`;
const filepath = path.join(queueDir, filename);

console.log('🚀 Creating test file for fixed orchestrator...');
console.log(`📁 File: ${filepath}`);

try {
  fs.writeFileSync(filepath, JSON.stringify(testMessage, null, 2));
  console.log('✅ Test file created!');
  console.log('👀 Watch orchestrator logs for Claude spawning...');
  console.log('🔍 Look for proper MCP config handling!');
  
} catch (error) {
  console.error('❌ Failed to create test file:', error);
}