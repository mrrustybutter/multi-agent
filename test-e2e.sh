#!/bin/bash

echo "🚀 End-to-End Multi-Agent System Test"
echo "====================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test directory
TEST_DIR="./test-results-$(date +%s)"
mkdir -p "$TEST_DIR"

echo -e "\n${YELLOW}📋 Test Plan:${NC}"
echo "1. Check all monitors are running"
echo "2. Test Twitch message → Queue → Orchestrator flow"
echo "3. Test Discord message handling"
echo "4. Test Social media actions"
echo "5. Verify semantic memory integration"

echo -e "\n${YELLOW}Step 1: Checking monitors...${NC}"
pm2 list

# Check if all required services are running
REQUIRED_SERVICES=("twitch-monitor" "discord-monitor" "orchestrator" "social-monitor" "event-monitor")
ALL_RUNNING=true

for service in "${REQUIRED_SERVICES[@]}"; do
    if pm2 describe "$service" | grep -q "online"; then
        echo -e "${GREEN}✓ $service is running${NC}"
    else
        echo -e "${RED}✗ $service is not running${NC}"
        ALL_RUNNING=false
    fi
done

if [ "$ALL_RUNNING" = false ]; then
    echo -e "${RED}Not all services are running! Please start them with: pm2 start ecosystem.config.cjs${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 2: Testing Twitch flow...${NC}"

# Create a test Twitch message that should trigger a response
QUEUE_DIR="./queues"
mkdir -p "$QUEUE_DIR"

# Clean old test messages
rm -f "$QUEUE_DIR"/test-*.json 2>/dev/null

# Create test message
cat > "$QUEUE_DIR/test-e2e-twitch-$(date +%s).json" << EOF
{
  "id": "e2e-twitch-$(date +%s)",
  "source": "twitch-chat",
  "priority": 2,
  "timestamp": "$(date -Iseconds)",
  "context": {
    "channel": "codingbutter",
    "user": "testuser",
    "displayName": "TestUser",
    "message": "Hey Rusty, explain the queue system!",
    "subscriber": false,
    "mod": false
  },
  "action": {
    "type": "respond",
    "content": "Respond to Twitch chat: explain the queue system",
    "data": {
      "channelId": "codingbutter"
    }
  }
}
EOF

echo "Created test Twitch message"
sleep 2

# Check orchestrator logs
echo -e "\n${YELLOW}Checking orchestrator processing...${NC}"
if tail -n 20 logs/orchestrator-*.log 2>/dev/null | grep -q "e2e-twitch"; then
    echo -e "${GREEN}✓ Orchestrator processed the message!${NC}"
else
    echo -e "${RED}✗ Orchestrator didn't process the message${NC}"
fi

echo -e "\n${YELLOW}Step 3: Testing Discord flow...${NC}"

cat > "$QUEUE_DIR/test-e2e-discord-$(date +%s).json" << EOF
{
  "id": "e2e-discord-$(date +%s)",
  "source": "discord",
  "priority": 2,
  "timestamp": "$(date -Iseconds)",
  "context": {
    "guildId": "test-guild",
    "channelId": "test-channel",
    "author": {
      "username": "TestDiscordUser"
    },
    "content": "!status"
  },
  "action": {
    "type": "get_status",
    "content": "Get Discord status"
  }
}
EOF

echo "Created test Discord message"
sleep 2

echo -e "\n${YELLOW}Step 4: Testing Social monitor...${NC}"

cat > "$QUEUE_DIR/test-e2e-social-$(date +%s).json" << EOF
{
  "id": "e2e-social-$(date +%s)",
  "source": "twitch",
  "priority": 2,
  "timestamp": "$(date -Iseconds)",
  "context": {},
  "action": {
    "type": "get_social_status",
    "content": "Get social monitor status",
    "data": {}
  }
}
EOF

echo "Created test Social status request"
sleep 2

echo -e "\n${YELLOW}Step 5: Memory test...${NC}"
# This would need actual memory testing once integrated

echo -e "\n${YELLOW}📊 Test Summary:${NC}"
echo "================================"

# Count processed messages
PROCESSED=$(tail -n 100 logs/orchestrator-*.log 2>/dev/null | grep -c "Task completed" || echo "0")
FAILED=$(tail -n 100 logs/orchestrator-*.log 2>/dev/null | grep -c "Task failed" || echo "0")

echo -e "Messages processed: ${GREEN}$PROCESSED${NC}"
echo -e "Messages failed: ${RED}$FAILED${NC}"

# Check queue
REMAINING=$(ls -la "$QUEUE_DIR" | grep -c "\.json$" || echo "0")
echo -e "Messages in queue: ${YELLOW}$REMAINING${NC}"

echo -e "\n${GREEN}✅ End-to-End test complete!${NC}"
echo "Check logs for detailed results"

# Save test results
{
    echo "Test run at: $(date)"
    echo "Services running: $ALL_RUNNING"
    echo "Messages processed: $PROCESSED"
    echo "Messages failed: $FAILED"
    echo "Queue remaining: $REMAINING"
} > "$TEST_DIR/results.txt"

echo -e "\nResults saved to: $TEST_DIR/results.txt"