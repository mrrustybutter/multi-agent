#!/usr/bin/env node

/**
 * Test live Claude spawning with fixed config
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create test message
const testMessage = {
  id: `live-claude-${Date.now()}`,
  timestamp: new Date().toISOString(),
  source: 'live-claude-test',
  priority: 'high',
  action: {
    type: 'respond',
    content: 'Test Claude spawning',
    data: {
      message: 'Hello Claude! This is a test of the orchestrator spawning system.',
      user: 'RustyButter'
    }
  },
  context: {
    platform: 'test',
    requires_response: true
  },
  ttl: 300
};

const queueDir = path.join(__dirname, 'orchestrator', 'queues', 'action');
const filename = `${testMessage.id}.json`;
const filepath = path.join(queueDir, filename);

console.log('🚀 Creating test file for live Claude spawning...');
console.log(`📁 File: ${filepath}`);

try {
  fs.writeFileSync(filepath, JSON.stringify(testMessage, null, 2));
  console.log('✅ Test file created!');
  console.log('👀 Watch orchestrator logs...');
  console.log('🔍 pm2 logs orchestrator --lines 50');
  
  // Monitor file existence
  let checks = 0;
  const checkInterval = setInterval(() => {
    checks++;
    if (!fs.existsSync(filepath)) {
      console.log(`✅ File processed after ${checks} seconds!`);
      clearInterval(checkInterval);
    } else if (checks > 30) {
      console.log('⚠️ File still exists after 30 seconds');
      clearInterval(checkInterval);
    }
  }, 1000);
  
} catch (error) {
  console.error('❌ Failed to create test file:', error);
}