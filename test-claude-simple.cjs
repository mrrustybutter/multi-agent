#!/usr/bin/env node

// Simple test to spawn Claude without MCP
const { spawn } = require('child_process');

console.log('Testing Claude spawn without MCP...');

const claudeProcess = spawn('claude', [
  '--print',
  '--verbose',
  '--output-format', 'stream-json'
], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let responseBuffer = '';

claudeProcess.stdout.on('data', (data) => {
  console.log('STDOUT:', data.toString());
  responseBuffer += data.toString();
  
  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop() || '';
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const event = JSON.parse(line);
        console.log('Parsed event:', event);
      } catch (e) {
        console.log('Raw line:', line);
      }
    }
  }
});

claudeProcess.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

claudeProcess.on('exit', (code) => {
  console.log('Claude exited with code:', code);
});

// Send a simple prompt
const prompt = 'Say hello!';
console.log('Sending prompt:', prompt);
claudeProcess.stdin.write(prompt + '\n');
claudeProcess.stdin.end();