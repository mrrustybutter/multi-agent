#!/bin/bash

# ============================================
# Rusty Butter Multi-Agent System - Environment Setup
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}"
echo "================================================"
echo "  Rusty Butter Multi-Agent System Setup"
echo "================================================"
echo -e "${NC}"

# Check if .env already exists
if [ -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file already exists!${NC}"
    read -p "Do you want to backup existing .env and create a new one? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        backup_file=".env.backup.$(date +%Y%m%d_%H%M%S)"
        cp .env "$backup_file"
        echo -e "${GREEN}✓ Backed up existing .env to $backup_file${NC}"
    else
        echo -e "${YELLOW}Setup cancelled. Your existing .env file was not modified.${NC}"
        exit 0
    fi
fi

# Copy template
cp .env.example .env
echo -e "${GREEN}✓ Created .env file from template${NC}"

# Function to update env variable
update_env() {
    local key=$1
    local prompt=$2
    local secret=$3
    local default=$4
    
    echo
    if [ "$default" != "" ]; then
        echo -e "${BLUE}$prompt${NC} ${YELLOW}[$default]${NC}:"
    else
        echo -e "${BLUE}$prompt${NC}:"
    fi
    
    if [ "$secret" == "true" ]; then
        read -s value
        echo
    else
        read value
    fi
    
    # Use default if no value provided
    if [ -z "$value" ] && [ "$default" != "" ]; then
        value="$default"
    fi
    
    # Update .env file
    if [ ! -z "$value" ]; then
        # Escape special characters for sed
        escaped_value=$(echo "$value" | sed 's/[[\.*^$()+?{|]/\\&/g')
        sed -i "s|^$key=.*|$key=$escaped_value|" .env
        echo -e "${GREEN}✓ $key configured${NC}"
    else
        echo -e "${YELLOW}⚠ $key skipped (using default)${NC}"
    fi
}

# Core Configuration
echo
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}CORE CONFIGURATION${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

update_env "ORCHESTRATOR_PORT" "Orchestrator API Port" "false" "8742"
update_env "ORCHESTRATOR_HOST" "Orchestrator Host" "false" "localhost"

# Calculate full URL
port=$(grep "^ORCHESTRATOR_PORT=" .env | cut -d'=' -f2)
host=$(grep "^ORCHESTRATOR_HOST=" .env | cut -d'=' -f2)
sed -i "s|^ORCHESTRATOR_URL=.*|ORCHESTRATOR_URL=http://$host:$port|" .env
echo -e "${GREEN}✓ ORCHESTRATOR_URL set to http://$host:$port${NC}"

# AI Providers
echo
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}AI PROVIDER CREDENTIALS${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "${RED}Required: Anthropic API key is needed to spawn Claude instances${NC}"
update_env "ANTHROPIC_API_KEY" "Anthropic API Key (required)" "true" ""

echo
echo -e "${RED}Required: ElevenLabs API key is needed for text-to-speech${NC}"
update_env "ELEVEN_API_KEY" "ElevenLabs API Key (required)" "true" ""

echo
read -p "Do you want to configure OpenAI? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    update_env "OPENAI_API_KEY" "OpenAI API Key" "true" ""
fi

# Platform Credentials
echo
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}PLATFORM CREDENTIALS${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Discord
echo
read -p "Do you want to configure Discord bot? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    update_env "DISCORD_TOKEN" "Discord Bot Token" "true" ""
    update_env "DISCORD_GUILD" "Discord Guild ID" "false" ""
fi

# Twitch
echo
read -p "Do you want to configure Twitch bot? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    update_env "TWITCH_USERNAME" "Twitch Bot Username" "false" ""
    update_env "TWITCH_OAUTH" "Twitch OAuth Token (include 'oauth:' prefix)" "true" ""
    update_env "TWITCH_CHANNEL" "Twitch Channel to Monitor" "false" "codingbutter"
fi

# Social Media
echo
read -p "Do you want to configure social media APIs? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo
    read -p "Configure X (Twitter) API? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        update_env "X_BEARER_TOKEN" "X (Twitter) Bearer Token" "true" ""
    fi
    
    echo
    read -p "Configure Reddit API? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        update_env "REDDIT_CLIENT_ID" "Reddit Client ID" "false" ""
        update_env "REDDIT_CLIENT_SECRET" "Reddit Client Secret" "true" ""
    fi
fi

# Advanced Settings
echo
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}ADVANCED SETTINGS${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

read -p "Do you want to configure advanced settings? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    update_env "MAX_CLAUDE_INSTANCES" "Max Concurrent Claude Instances" "false" "10"
    update_env "LOG_LEVEL" "Log Level (debug/info/warn/error)" "false" "info"
    update_env "NODE_ENV" "Environment (development/production)" "false" "development"
    
    echo
    read -p "Enable API authentication for orchestrator? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Generate random API key
        api_key=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
        sed -i "s|^API_KEY=.*|API_KEY=$api_key|" .env
        echo -e "${GREEN}✓ Generated API Key: $api_key${NC}"
        echo -e "${YELLOW}  Save this key! You'll need it to access the orchestrator API.${NC}"
    fi
fi

# Validate required fields
echo
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}VALIDATION${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

missing_required=false

# Check Anthropic API key
if grep -q "^ANTHROPIC_API_KEY=your_anthropic_api_key_here" .env; then
    echo -e "${RED}✗ Missing required: ANTHROPIC_API_KEY${NC}"
    missing_required=true
fi

# Check ElevenLabs API key
if grep -q "^ELEVEN_API_KEY=your_elevenlabs_api_key_here" .env; then
    echo -e "${RED}✗ Missing required: ELEVEN_API_KEY${NC}"
    missing_required=true
fi

if [ "$missing_required" = true ]; then
    echo
    echo -e "${RED}⚠️  Warning: Some required API keys are not configured.${NC}"
    echo -e "${RED}   The system will not work properly without them.${NC}"
    echo -e "${YELLOW}   Edit .env manually to add missing keys later.${NC}"
else
    echo -e "${GREEN}✓ All required API keys configured${NC}"
fi

# Create necessary directories
echo
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}DIRECTORY SETUP${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

mkdir -p logs queues memory
echo -e "${GREEN}✓ Created necessary directories (logs, queues, memory)${NC}"

# Summary
echo
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}SETUP COMPLETE!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo -e "${BLUE}Next steps:${NC}"
echo "1. Review and edit .env file for any additional settings"
echo "2. Install dependencies: pnpm install"
echo "3. Build the project: pnpm build"
echo "4. Start the system: pnpm start"
echo
echo -e "${YELLOW}Orchestrator will be available at: http://$host:$port${NC}"
echo
echo -e "${GREEN}Happy streaming! 🚀${NC}"