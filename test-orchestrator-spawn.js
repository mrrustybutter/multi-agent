#!/usr/bin/env node

/**
 * Test script for orchestrator Claude spawning functionality
 * Creates test events and verifies the orchestrator spawns Claude instances
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create test message for social monitor
const testSocialEvent = {
  id: `test-${Date.now()}`,
  timestamp: new Date().toISOString(),
  source: 'social-monitor-test',
  priority: 'high',
  action: {
    type: 'social-respond',
    content: 'Test social media response',
    data: {
      post: {
        id: '123456789',
        platform: 'twitter',
        author: {
          id: 'testuser',
          username: 'testuser',
          displayName: 'Test User'
        },
        content: '@codingbutter Hey Rusty! Can you help me with some JavaScript debugging?',
        timestamp: new Date(),
        url: 'https://twitter.com/testuser/status/123456789'
      },
      action: 'respond',
      context: 'User asking for JavaScript debugging help on Twitter'
    }
  },
  context: {
    platform: 'twitter',
    requires_response: true,
    mention: true
  },
  ttl: 300
};

// Create test message for Discord monitor
const testDiscordEvent = {
  id: `test-discord-${Date.now()}`,
  timestamp: new Date().toISOString(),
  source: 'discord-monitor-test',
  priority: 'medium',
  action: {
    type: 'discord-respond',
    content: 'Test Discord response',
    data: {
      message: {
        id: 'discord123',
        content: 'Hey @RustyButter, can you explain how async/await works?',
        author: {
          id: '456789',
          username: 'developer_friend',
          displayName: 'Developer Friend'
        },
        channel: 'general',
        guild: 'Mr.RustyButter'
      },
      action: 'respond',
      context: 'User asking about async/await in Discord'
    }
  },
  context: {
    platform: 'discord',
    requires_response: true,
    channel: 'general'
  },
  ttl: 300
};

// Create test message for code generation task
const testCodeEvent = {
  id: `test-code-${Date.now()}`,
  timestamp: new Date().toISOString(),
  source: 'orchestrator-test',
  priority: 'high',
  action: {
    type: 'code-generation',
    content: 'Generate TypeScript interface',
    data: {
      task: 'Create a TypeScript interface for user preferences',
      requirements: [
        'Include theme settings',
        'Include notification preferences', 
        'Include language settings',
        'Make all fields optional'
      ],
      output_path: './generated-interface.ts'
    }
  },
  context: {
    task_type: 'code-generation',
    requires_llm: 'openai'  // Should route to OpenAI for code generation
  },
  ttl: 600
};

// Queue directories
const actionQueueDir = path.join(__dirname, 'orchestrator', 'queues', 'action');
const performanceQueueDir = path.join(__dirname, 'orchestrator', 'queues', 'performance');

// Ensure queue directories exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Write test message to queue
function writeTestMessage(message, queueType = 'action') {
  const queueDir = queueType === 'action' ? actionQueueDir : performanceQueueDir;
  ensureDir(queueDir);
  
  const filename = `${message.id}.json`;
  const filepath = path.join(queueDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(message, null, 2));
  console.log(`✅ Created test message: ${filepath}`);
  
  return filepath;
}

// Main test function
async function runOrchestratorTest() {
  console.log('🚀 Starting Orchestrator Spawn Test...\n');
  
  try {
    // Test 1: Social media response (should use Anthropic)
    console.log('📱 Test 1: Social Media Response Event');
    const socialFile = writeTestMessage(testSocialEvent, 'action');
    
    // Test 2: Discord response (should use Anthropic)
    console.log('💬 Test 2: Discord Response Event');
    const discordFile = writeTestMessage(testDiscordEvent, 'action');
    
    // Test 3: Code generation (should use OpenAI)
    console.log('⚡ Test 3: Code Generation Event');
    const codeFile = writeTestMessage(testCodeEvent, 'performance');
    
    console.log('\n📋 Test Summary:');
    console.log('- Created 3 test events in orchestrator queues');
    console.log('- Social & Discord events should spawn Anthropic Claude instances');
    console.log('- Code generation event should spawn OpenAI-powered instance');
    console.log('- Check orchestrator logs to verify spawning behavior');
    
    console.log('\n🔍 Monitor these files for processing:');
    console.log(`- ${socialFile}`);
    console.log(`- ${discordFile}`);
    console.log(`- ${codeFile}`);
    
    console.log('\n💡 Next steps:');
    console.log('1. Start the orchestrator: cd orchestrator && npm run dev');
    console.log('2. Watch the logs for Claude spawning messages');
    console.log('3. Check if test files get processed and removed from queues');
    console.log('4. Verify correct LLM providers are used for each task type');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runOrchestratorTest().then(() => {
  console.log('\n✨ Orchestrator spawn test setup complete!');
}).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});