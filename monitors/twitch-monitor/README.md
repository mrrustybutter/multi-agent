# Twitch Monitor MCP Server

A modular Twitch chat monitor that exposes MCP tools for the multi-agent system.

## Features

- Monitors Twitch chat in real-time
- Exposes MCP tools for agents to interact with chat
- Maintains message history
- Supports filtering and waiting for specific messages

## MCP Tools

- `get_recent_messages` - Retrieve recent chat messages
- `send_message` - Send a message to Twitch chat  
- `get_connection_status` - Check connection status
- `wait_for_message` - Wait for specific messages with filters

## Configuration

Set environment variables:
- `TWITCH_CHANNEL` - Channel to monitor (default: mrrustybutter)
- `TWITCH_USERNAME` - Bot username (optional)
- `TWITCH_OAUTH_TOKEN` - OAuth token for sending messages (optional)

## Usage

```bash
# Development
npm run dev

# Production (via PM2)
pm2 start ecosystem.config.js --only twitch-monitor
```