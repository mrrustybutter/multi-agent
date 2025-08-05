#!/bin/bash

# Test script to check social monitor status
# This creates a queue message for getting social status

QUEUE_DIR="./queues"

# Create queue directory if it doesn't exist
mkdir -p "$QUEUE_DIR"

# Create a test status request
cat > "$QUEUE_DIR/test-social-status-$(date +%s).json" << EOF
{
  "id": "social-status-$(date +%s)",
  "source": "twitch",
  "priority": 2,
  "timestamp": "$(date -Iseconds)",
  "context": {
    "channel": "codingbutter",
    "user": "moderator",
    "message": "!social status"
  },
  "action": {
    "type": "get_social_status",
    "content": "Get social monitor status",
    "data": {}
  }
}
EOF

echo "✅ Test social status request created in $QUEUE_DIR"
echo "📊 Checking queue..."
ls -la "$QUEUE_DIR"