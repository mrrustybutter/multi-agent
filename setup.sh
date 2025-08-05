#!/bin/bash

# Setup script for Rusty Butter Multi-Agent System

echo "🚀 Rusty Butter Multi-Agent System Setup"
echo "========================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}No .env file found. Creating from template...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file${NC}"
    echo -e "${RED}⚠️  Please edit .env and add your API keys!${NC}"
    echo ""
fi

# Function to check if a value is set in .env
check_env_var() {
    local var_name=$1
    local var_value=$(grep "^$var_name=" .env | cut -d '=' -f2)
    
    if [[ -z "$var_value" || "$var_value" == *"your_"* || "$var_value" == *"_here"* ]]; then
        return 1
    else
        return 0
    fi
}

# Check required environment variables
echo "📋 Checking environment variables..."
echo ""

MISSING_REQUIRED=0

# Check ElevenLabs
if check_env_var "ELEVEN_API_KEY"; then
    echo -e "${GREEN}✓ ElevenLabs API key configured${NC}"
else
    echo -e "${RED}✗ ElevenLabs API key missing (REQUIRED for voice)${NC}"
    MISSING_REQUIRED=1
fi

# Check Discord
if check_env_var "DISCORD_TOKEN"; then
    echo -e "${GREEN}✓ Discord token configured${NC}"
else
    echo -e "${RED}✗ Discord token missing (REQUIRED for Discord monitoring)${NC}"
    MISSING_REQUIRED=1
fi

if check_env_var "DISCORD_GUILD"; then
    echo -e "${GREEN}✓ Discord guild ID configured${NC}"
else
    echo -e "${RED}✗ Discord guild ID missing (REQUIRED for Discord monitoring)${NC}"
    MISSING_REQUIRED=1
fi

# Check optional Twitch
echo ""
if check_env_var "TWITCH_USERNAME" && check_env_var "TWITCH_OAUTH"; then
    echo -e "${GREEN}✓ Twitch credentials configured (can send messages)${NC}"
else
    echo -e "${YELLOW}⚠️  Twitch credentials not configured (read-only mode)${NC}"
fi

# Check if we have all required vars
if [ $MISSING_REQUIRED -eq 1 ]; then
    echo ""
    echo -e "${RED}❌ Missing required environment variables!${NC}"
    echo -e "${YELLOW}Please edit .env and add the missing values.${NC}"
    echo ""
    echo "To get API keys:"
    echo "  - ElevenLabs: https://elevenlabs.io/api"
    echo "  - Discord Bot: https://discord.com/developers/applications"
    echo "  - Twitch OAuth: https://twitchapps.com/tmi/"
    echo ""
    exit 1
fi

# Create necessary directories
echo ""
echo "📁 Creating directories..."
mkdir -p logs queues
echo -e "${GREEN}✓ Created logs/ and queues/ directories${NC}"

# Check Node.js version
echo ""
echo "🔍 Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 20 ]; then
    echo -e "${GREEN}✓ Node.js version $(node -v) is compatible${NC}"
else
    echo -e "${RED}✗ Node.js 20+ required (found $(node -v))${NC}"
    exit 1
fi

# Check pnpm
echo ""
echo "📦 Checking package manager..."
if command -v pnpm &> /dev/null; then
    echo -e "${GREEN}✓ pnpm is installed${NC}"
else
    echo -e "${YELLOW}Installing pnpm...${NC}"
    npm install -g pnpm
fi

# Check PM2
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✓ PM2 is installed${NC}"
else
    echo -e "${YELLOW}Installing PM2...${NC}"
    npm install -g pm2
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
pnpm install

# Build packages
echo ""
echo "🔨 Building packages..."
pnpm build

# Success!
echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "To start the system:"
echo -e "  ${BLUE}./test-system.sh${NC}     # Full test with logs"
echo -e "  ${BLUE}pnpm start${NC}           # Start with PM2"
echo -e "  ${BLUE}pnpm logs${NC}            # View logs"
echo ""
echo "Happy streaming! 🚀"