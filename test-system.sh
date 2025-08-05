#!/bin/bash

# Test script for multi-agent system
# This starts the system in development mode for testing

echo "🚀 Starting Rusty Butter Multi-Agent System Test"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Not in multi-agent directory!${NC}"
    exit 1
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command_exists pnpm; then
    echo -e "${RED}Error: pnpm not installed!${NC}"
    echo "Install with: npm install -g pnpm"
    exit 1
fi

if ! command_exists pm2; then
    echo -e "${RED}Error: pm2 not installed!${NC}"
    echo "Install with: npm install -g pm2"
    exit 1
fi

if ! command_exists tsx; then
    echo -e "${YELLOW}Warning: tsx not installed globally${NC}"
    echo "Installing locally..."
fi

# Check environment variables
echo "🔐 Checking environment variables..."

if [ -z "$ELEVEN_API_KEY" ]; then
    echo -e "${YELLOW}Warning: ELEVEN_API_KEY not set${NC}"
fi

if [ -z "$DISCORD_TOKEN" ]; then
    echo -e "${YELLOW}Warning: DISCORD_TOKEN not set${NC}"
fi

if [ -z "$TWITCH_USERNAME" ] || [ -z "$TWITCH_OAUTH" ]; then
    echo -e "${YELLOW}Warning: Twitch credentials not set${NC}"
    echo "Twitch monitor will run in read-only mode"
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p logs queues

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build packages
echo "🔨 Building packages..."
pnpm build

# Kill any existing PM2 processes
echo "🔪 Cleaning up existing processes..."
pm2 kill

# Start the system
echo "🎯 Starting multi-agent system..."
pm2 start ecosystem.config.cjs

# Show status
sleep 3
echo ""
echo "📊 System Status:"
pm2 status

# Show logs
echo ""
echo "📜 Streaming logs (Ctrl+C to stop)..."
echo "================================================"
pm2 logs

# Cleanup on exit
trap 'echo ""; echo "🛑 Stopping system..."; pm2 kill; exit' INT TERM