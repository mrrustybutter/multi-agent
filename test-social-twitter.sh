#!/bin/bash

# Test Twitter search functionality
QUEUE_DIR="./queues"
mkdir -p "$QUEUE_DIR"

# Create Twitter search test
cat > "$QUEUE_DIR/test-twitter-search-$(date +%s).json" << EOF
{
  "id": "twitter-search-$(date +%s)",
  "source": "twitch",
  "priority": 2,
  "timestamp": "$(date -Iseconds)",
  "context": {
    "channel": "codingbutter",
    "user": "moderator",
    "message": "!twitter search coding"
  },
  "action": {
    "type": "search_social",
    "content": "Search Twitter for coding",
    "data": {
      "query": "coding",
      "platform": "twitter",
      "limit": 3
    }
  }
}
EOF

echo "✅ Twitter search test created"

# Also test Twitch monitor status
cat > "$QUEUE_DIR/test-twitch-status-$(date +%s).json" << EOF
{
  "id": "twitch-status-$(date +%s)",
  "source": "twitch",
  "priority": 1,
  "timestamp": "$(date -Iseconds)",
  "context": {
    "channel": "codingbutter",
    "user": "user123",
    "message": "!status"
  },
  "action": {
    "type": "get_status",
    "content": "Get twitch monitor status",
    "data": {}
  }
}
EOF

echo "✅ Twitch status test created"
ls -la "$QUEUE_DIR"