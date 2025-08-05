#!/bin/bash

# Test script to simulate a Discord message
# This creates a queue message that should trigger processing

QUEUE_DIR="./queues"

# Create queue directory if it doesn't exist
mkdir -p "$QUEUE_DIR"

# Create a test Discord message
cat > "$QUEUE_DIR/test-discord-$(date +%s).json" << EOF
{
  "id": "discord-test-$(date +%s)",
  "source": "discord", 
  "priority": 2,
  "timestamp": "$(date -Iseconds)",
  "context": {
    "guildId": "1213176179137699840",
    "guildName": "Test Server",
    "channelId": "123456789",
    "channelName": "general",
    "author": {
      "id": "987654321",
      "username": "TestUser",
      "discriminator": "0001",
      "bot": false
    },
    "content": "Hey Rusty, can you explain how MCP servers work?",
    "messageId": "msg-$(date +%s)"
  },
  "action": {
    "type": "respond",
    "content": "Explain MCP servers briefly",
    "data": {
      "channelId": "123456789",
      "message": "MCP (Model Context Protocol) servers are tools that LLMs can connect to..."
    }
  }
}
EOF

echo "✅ Test Discord message created in $QUEUE_DIR"
echo "📊 Checking queue..."
ls -la "$QUEUE_DIR"