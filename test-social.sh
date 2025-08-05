#!/bin/bash

# Test script to simulate a social media action
# This creates a queue message for searching Twitter

QUEUE_DIR="./queues"

# Create queue directory if it doesn't exist
mkdir -p "$QUEUE_DIR"

# Create a test Twitter search request
cat > "$QUEUE_DIR/test-twitter-$(date +%s).json" << EOF
{
  "id": "twitter-test-$(date +%s)",
  "source": "twitch",
  "priority": 2,
  "timestamp": "$(date -Iseconds)",
  "context": {
    "channel": "codingbutter",
    "user": "moderator",
    "message": "!twitter search rust programming"
  },
  "action": {
    "type": "search_social",
    "content": "Search Twitter for rust programming",
    "data": {
      "query": "rust programming",
      "platform": "twitter",
      "limit": 5
    }
  }
}
EOF

echo "✅ Test Twitter search request created in $QUEUE_DIR"
echo "📊 Checking queue..."
ls -la "$QUEUE_DIR"