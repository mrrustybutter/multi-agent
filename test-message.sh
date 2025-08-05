#!/bin/bash

# Test script to simulate a Twitch message
# This creates a queue message that should trigger Claude

QUEUE_DIR="./queues"

# Create queue directory if it doesn't exist
mkdir -p "$QUEUE_DIR"

# Create a test message
cat > "$QUEUE_DIR/test-twitch-$(date +%s).json" << EOF
{
  "id": "test-$(date +%s)",
  "source": "twitch",
  "priority": 1,
  "timestamp": "$(date -Iseconds)",
  "context": {
    "channel": "codingbutter",
    "username": "testuser",
    "message": "Hey Claude, can you explain what Docker containers are?",
    "badges": ["subscriber"],
    "emotes": {}
  },
  "action": {
    "type": "spawn_claude",
    "content": "Respond to the Twitch user's question about Docker containers",
    "data": {
      "prompt": "A Twitch user named 'testuser' asked: 'Hey Claude, can you explain what Docker containers are?' Please provide a concise explanation suitable for a Twitch chat response.",
      "mcpConnections": ["twitch-monitor", "semantic-memory", "rustybutter-avatar", "elevenlabs"]
    }
  }
}
EOF

echo "✅ Test message created in $QUEUE_DIR"
echo "📊 Checking queue..."
ls -la "$QUEUE_DIR"