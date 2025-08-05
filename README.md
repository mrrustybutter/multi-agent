# Rusty Butter Multi-Agent System

A sophisticated multi-agent AI system that coordinates Claude instances across various platforms (Twitch, Discord, Social Media) for autonomous streaming, content creation, and community interaction.

## 🚀 Overview

This system implements a modern, modular architecture with multiple specialized components:

- **Orchestrator**: Central coordinator that spawns Claude instances based on events
- **Monitors**: Platform-specific event detection (Social Media, Discord, Twitch, Events)
- **Tools**: Shared MCP servers providing specialized capabilities (Discord, Browser automation)
- **Multi-LLM Support**: Routes different tasks to optimal AI providers (Anthropic, OpenAI, local models)
- **Semantic Memory**: Persistent context and knowledge retention across sessions

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Twitch    │     │   Discord   │     │    Event    │
│   Monitor   │     │   Monitor   │     │   Monitor   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Queue     │
                    │   System    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Orchestrator│◄──── MCP Servers
                    └─────────────┘      (Avatar, Voice, Memory)
```

## 📦 Packages

- `@rusty-butter/twitch-monitor` - Twitch bot with MCP server
- `@rusty-butter/discord-monitor` - Discord bot with MCP server  
- `@rusty-butter/event-monitor` - System event scheduler with MCP
- `@rusty-butter/orchestrator` - Main coordinator
- `@rusty-butter/logger` - Centralized logging system
- `@rusty-butter/shared` - Shared utilities
- `@rusty-butter/expression-mapper` - Maps text to avatar expressions

## 🛠️ Setup

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- PM2 (`npm install -g pm2`)

### Environment Variables

Create a `.env` file in the multi-agent directory:

```bash
# ElevenLabs (required for voice)
ELEVEN_API_KEY=your_api_key

# Discord (required for Discord monitor)
DISCORD_TOKEN=your_bot_token
DISCORD_GUILD=your_guild_id

# Twitch (optional - for sending messages)
TWITCH_USERNAME=your_bot_username
TWITCH_OAUTH=oauth:your_token
```

### Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## 🚀 Running

### Quick Start

```bash
# Run the test script (recommended)
./test-system.sh

# Or use npm scripts
pnpm test
```

### Manual Control

```bash
# Start all services
pnpm start

# View logs
pnpm logs

# Check status
pnpm status

# Stop all services
pnpm stop

# Clean up
pnpm clean:logs
pnpm clean:queues
```

### Individual Services

```bash
# Run individual monitors (for development)
pnpm dev:twitch
pnpm dev:discord
pnpm dev:orchestrator
```

## 📝 How It Works

1. **Monitors** watch for events (chat messages, Discord activity, scheduled events)
2. When relevant events occur, monitors spawn **Claude agents** with specific tasks
3. Claude agents process tasks and write actions to **queue files**
4. The **Orchestrator** reads queue files and executes actions through MCP servers
5. Actions include speaking (ElevenLabs), avatar changes, memory storage, and responses

## 🔧 Development

### Adding a New Monitor

1. Create a new folder in `monitors/`
2. Set up package.json with MCP server dependencies
3. Implement the monitor following the pattern in existing monitors
4. Add to ecosystem.config.ts

### Queue Message Format

```typescript
interface QueueMessage {
  id: string;
  timestamp: string;
  source: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  action: {
    type: 'speak' | 'avatar' | 'memory' | 'respond' | 'execute';
    content?: string;
    data?: any;
  };
  context?: any;
  ttl?: number; // Time to live in seconds
}
```

## 📊 Monitoring

- Logs are stored in `./logs/`
- Each service has separate log files
- Use `pm2 monit` for real-time monitoring
- Queue files are in `./queues/` for debugging

## 🐛 Troubleshooting

### Services not starting
- Check logs: `pm2 logs [service-name]`
- Verify environment variables are set
- Ensure all dependencies are installed: `pnpm install`

### No audio output
- Verify ELEVEN_API_KEY is set correctly
- Check orchestrator logs for errors

### Monitors not detecting events
- Ensure proper tokens/credentials are set
- Check individual monitor logs
- Verify network connectivity

## 🤝 Contributing

This is an experimental autonomous streaming system. Feel free to:
- Report issues
- Suggest improvements
- Add new monitors or capabilities
- Improve the orchestration logic

## 📄 License

MIT License - because sharing is caring!

---

Built with ☕ and chaos by Rusty Butter