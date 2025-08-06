#!/bin/bash

# Test MongoDB Integration for Rusty Butter System
# This script tests all MongoDB integration points

set -e

echo "============================================"
echo "Testing MongoDB Integration"
echo "============================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ORCHESTRATOR_URL="http://localhost:8742"
ERRORS=0

# Check if MongoDB is running
echo -e "\n${YELLOW}1. Checking MongoDB Status...${NC}"
if systemctl is-active --quiet mongod; then
    echo -e "${GREEN}✓ MongoDB is running${NC}"
else
    echo -e "${RED}✗ MongoDB is not running${NC}"
    exit 1
fi

# Test MongoDB connection
echo -e "\n${YELLOW}2. Testing MongoDB Connection...${NC}"
if mongosh 'mongodb://rusty:butter@localhost:27017/rusty-butter' --eval "db.stats()" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ MongoDB connection successful${NC}"
else
    echo -e "${RED}✗ MongoDB connection failed${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check if orchestrator is running
echo -e "\n${YELLOW}3. Checking Orchestrator API...${NC}"
if curl -s "${ORCHESTRATOR_URL}/api/status" > /dev/null; then
    echo -e "${GREEN}✓ Orchestrator API is running${NC}"
else
    echo -e "${RED}✗ Orchestrator API is not running${NC}"
    echo "  Start with: pnpm start"
    ERRORS=$((ERRORS + 1))
fi

# Test configuration API endpoint
echo -e "\n${YELLOW}4. Testing Configuration API...${NC}"
CONFIG_RESPONSE=$(curl -s "${ORCHESTRATOR_URL}/api/config")
if echo "$CONFIG_RESPONSE" | grep -q "monitoring"; then
    echo -e "${GREEN}✓ Configuration API returns data${NC}"
    echo "  Monitoring enabled: $(echo "$CONFIG_RESPONSE" | grep -o '"discordEnabled":[^,]*' | cut -d: -f2)"
else
    echo -e "${RED}✗ Configuration API failed${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Test event submission to MongoDB
echo -e "\n${YELLOW}5. Testing Event Submission...${NC}"
EVENT_RESPONSE=$(curl -s -X POST "${ORCHESTRATOR_URL}/api/event" \
    -H "Content-Type: application/json" \
    -d '{
        "source": "test-script",
        "type": "test_event",
        "priority": "low",
        "data": {
            "message": "Testing MongoDB integration",
            "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
        }
    }')

if echo "$EVENT_RESPONSE" | grep -q "eventId"; then
    EVENT_ID=$(echo "$EVENT_RESPONSE" | grep -o '"eventId":"[^"]*' | cut -d'"' -f4)
    echo -e "${GREEN}✓ Event submitted successfully${NC}"
    echo "  Event ID: $EVENT_ID"
else
    echo -e "${RED}✗ Event submission failed${NC}"
    echo "  Response: $EVENT_RESPONSE"
    ERRORS=$((ERRORS + 1))
fi

# Test event retrieval from MongoDB
echo -e "\n${YELLOW}6. Testing Event Retrieval...${NC}"
EVENTS_RESPONSE=$(curl -s "${ORCHESTRATOR_URL}/api/activity/events?limit=5")
if echo "$EVENTS_RESPONSE" | grep -q "events"; then
    EVENT_COUNT=$(echo "$EVENTS_RESPONSE" | grep -o '"id"' | wc -l)
    echo -e "${GREEN}✓ Events retrieved from MongoDB${NC}"
    echo "  Found $EVENT_COUNT recent events"
else
    echo -e "${RED}✗ Event retrieval failed${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Test event statistics
echo -e "\n${YELLOW}7. Testing Event Statistics...${NC}"
STATS_RESPONSE=$(curl -s "${ORCHESTRATOR_URL}/api/activity/events/stats")
if echo "$STATS_RESPONSE" | grep -q "totalEvents"; then
    TOTAL_EVENTS=$(echo "$STATS_RESPONSE" | grep -o '"totalEvents":[0-9]*' | cut -d: -f2)
    echo -e "${GREEN}✓ Event statistics working${NC}"
    echo "  Total events in database: $TOTAL_EVENTS"
else
    echo -e "${RED}✗ Event statistics failed${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check MongoDB collections
echo -e "\n${YELLOW}8. Checking MongoDB Collections...${NC}"
COLLECTIONS=$(mongosh 'mongodb://rusty:butter@localhost:27017/rusty-butter' --quiet --eval "db.getCollectionNames().join(', ')")
echo "  Collections: $COLLECTIONS"

# Count documents in each collection
for collection in configs events memories; do
    COUNT=$(mongosh 'mongodb://rusty:butter@localhost:27017/rusty-butter' --quiet --eval "db.$collection.countDocuments()")
    echo "  - $collection: $COUNT documents"
done

# Summary
echo -e "\n============================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All MongoDB integration tests passed!${NC}"
    echo -e "\nNext steps:"
    echo "1. Start monitors: pnpm start"
    echo "2. View dashboard: http://localhost:3420"
    echo "3. Send test events to see real-time updates"
else
    echo -e "${RED}✗ $ERRORS test(s) failed${NC}"
    echo -e "\nTroubleshooting:"
    echo "1. Check MongoDB: systemctl status mongod"
    echo "2. Check orchestrator logs: pnpm logs"
    echo "3. Reseed config: pnpm seed:config"
fi
echo "============================================"

exit $ERRORS