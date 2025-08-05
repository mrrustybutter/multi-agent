#!/bin/bash

# Create a fake Twitch message that should trigger response
QUEUE_DIR="./queues"
mkdir -p "$QUEUE_DIR"

# Simulate a message mentioning Rusty
cat > "$QUEUE_DIR/test-twitch-respond-$(date +%s).json" << EOF
{
  "id": "twitch-test-$(date +%s)",
  "source": "twitch-chat",
  "priority": 2,
  "timestamp": "$(date -Iseconds)",
  "context": {
    "channel": "codingbutter",
    "user": "testuser",
    "displayName": "TestUser",
    "message": "Hey Rusty, how are you?",
    "subscriber": false,
    "mod": false
  },
  "action": {
    "type": "respond",
    "content": "Respond to Twitch chat from testuser: \"Hey Rusty, how are you?\"",
    "data": {
      "channelId": "codingbutter",
      "replyTo": "test-123"
    }
  }
}
EOF

echo "✅ Twitch respond test created"
ls -la "$QUEUE_DIR"