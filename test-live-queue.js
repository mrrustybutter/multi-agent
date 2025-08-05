#!/usr/bin/env node

/**
 * Test live queue processing by creating a new file while orchestrator is running
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a simple test message
const testMessage = {
  id: `live-test-${Date.now()}`,
  timestamp: new Date().toISOString(),
  source: 'live-test',
  priority: 'high',
  action: {
    type: 'social-respond',
    content: 'Live test: respond to simple question',
    data: {
      post: {
        id: 'test123',
        platform: 'twitter',
        author: {
          username: 'testuser',
          displayName: 'Test User'
        },
        content: 'Hello @codingbutter! What is 2+2?',
        timestamp: new Date().toISOString(),
        url: 'https://twitter.com/testuser/status/test123'
      },
      action: 'respond',
      context: 'Simple math question test'
    }
  },
  context: {
    platform: 'twitter',
    requires_response: true,
    mention: true
  },
  ttl: 300
};

const queueDir = path.join(__dirname, 'orchestrator', 'queues', 'action');
const filename = `${testMessage.id}.json`;
const filepath = path.join(queueDir, filename);

console.log('🔥 Creating live test queue file...');
console.log(`📁 File: ${filepath}`);

try {
  fs.writeFileSync(filepath, JSON.stringify(testMessage, null, 2));
  console.log('✅ Live test file created successfully!');
  console.log('🔍 Watch orchestrator logs for processing...');
  console.log(`📋 Test message ID: ${testMessage.id}`);
  
  // Wait a moment then check if file gets processed
  setTimeout(() => {
    if (fs.existsSync(filepath)) {
      console.log('⚠️  File still exists - may not be processed yet');
    } else {
      console.log('🎉 File processed and removed!');
    }
  }, 10000);
  
} catch (error) {
  console.error('❌ Failed to create test file:', error);
}