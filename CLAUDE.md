# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

### Core Commands
```bash
# Install dependencies (use pnpm)
pnpm install

# Build all packages
pnpm build

# Type checking across all packages
pnpm typecheck

# Linting across all packages
pnpm lint

# Start all services with PM2
pnpm start

# Stop all services
pnpm stop

# View logs
pnpm logs

# Check service status
pnpm status

# Clean logs and queues
pnpm clean:logs
pnpm clean:queues
```

### Development Commands
```bash
# Run individual monitors for development
pnpm dev:twitch       # Twitch monitor
pnpm dev:discord      # Discord monitor
pnpm dev:orchestrator # Orchestrator

# Run tests (if test script exists in individual packages)
pnpm -r test
```

## Architecture Overview

This is a multi-agent AI system that coordinates Claude instances across various platforms for autonomous streaming and content creation. The system uses a modular, event-driven architecture with a centralized orchestrator API.

### Core System Flow
1. **Monitors** detect platform events and send them to the orchestrator API
2. **Orchestrator API** receives events and determines which LLM provider to use based on task type
3. **Claude Code Proxy** routes Claude instances to different LLM providers (OpenAI, Gemini, Grok, etc.)
4. **Main Claude** (using appropriate LLM) analyzes events and spawns specialized child instances
5. **Child Claudes** execute tasks using appropriate MCP servers and tools
6. **Semantic Memory** stores important information for cross-session context retention

### Key Components

**Orchestrator** (`apps/orchestrator/`)
- Express API server (port 8742) that manages Claude instance spawning
- Routes different task types to appropriate LLM providers:
  - **Coding tasks** → Claude (Anthropic)
  - **Chat/Social** → GPT-4 (OpenAI)
  - **Quick responses** → Gemini (Google)
  - **Memory operations** → Groq (fast inference)
- Endpoints:
  - `POST /event` - Submit new events from monitors
  - `GET /status` - System status and active Claude instances  
  - `POST /claude/spawn` - Spawn Claude instances (used by main Claude)
  - `POST /memory/embed` - Store information in semantic memory

**Claude Code Proxy** (`apps/claude-code-proxy/`)
- Proxy server (port 8743) that enables multi-LLM support
- Routes Claude Code instances to different providers via Anthropic-compatible API
- Supported providers: OpenAI, Gemini, Grok, Groq, OpenRouter, Cerebras
- Transforms requests/responses between different API formats

**Monitors** (`monitors/`)
- Platform-specific event detection modules that send events to orchestrator API
- Each monitor runs as an independent MCP server
- Send events via HTTP POST to orchestrator `/event` endpoint
- Includes: twitch-monitor, discord-monitor, event-monitor, social-monitor

**Tools** (`tools/`)
- Shared MCP servers providing specialized capabilities
- discord-tools: Multi-session Discord management and voice handling
- playwright-sse: Persistent browser automation with Server-Sent Events

**Shared** (`shared/`)
- Common utilities including MCP connection management, queue manager, and memory integration
- Provides cross-component functionality

### Event System
Events sent to orchestrator follow this structure:
```typescript
{
  source: string;        // 'twitch', 'discord', 'social', etc.
  type: string;          // 'chat_message', 'mention', etc.
  priority: 'low' | 'medium' | 'high' | 'critical';
  data: any;             // Event-specific data
  context?: any;         // Additional context
  requiredTools?: string[]; // MCP servers needed
}
```

### Claude Instance Hierarchy
- **Main Claude**: Spawned by orchestrator for each event, has full tool access
- **Child Claudes**: Spawned by main Claude for specialized tasks, detached execution
- Each instance tracks its role, parent, and event association

### Environment Configuration

Configuration is centralized in a single `.env` file at the project root. Use the setup script for easy configuration:

```bash
./setup-env.sh  # Interactive setup wizard
```

Or manually copy `.env.example` to `.env` and configure:

**Core Settings:**
- `ORCHESTRATOR_PORT=8742` - API server port (obscure for security)
- `ORCHESTRATOR_URL=http://localhost:8742` - Full URL for monitors
- `CLAUDE_PROXY_PORT=8743` - Proxy server for multi-LLM routing
- `CLAUDE_PROXY_URL=http://localhost:8743` - Proxy URL

**Required Credentials:**
- `ANTHROPIC_API_KEY` - Claude API key for coding tasks
- `OPENAI_API_KEY` - GPT-4 for chat/social interactions
- `ELEVEN_API_KEY` - ElevenLabs API for voice synthesis

**Optional LLM Providers:**
- `GEMINI_API_KEY` - Google Gemini for fast responses
- `GROK_API_KEY` - X.AI Grok for Twitter interactions
- `GROQ_API_KEY` - Groq for ultra-fast inference
- `OPENROUTER_API_KEY` - Access to multiple models
- `CEREBRAS_API_KEY` - Ultra-fast inference

**Platform Credentials (as needed):**
- `DISCORD_TOKEN`, `DISCORD_GUILD` - Discord bot
- `TWITCH_USERNAME`, `TWITCH_OAUTH` - Twitch bot
- Social media API keys (X/Twitter, Reddit, Instagram)

See `.env.example` for complete configuration options including advanced settings, security, and rate limiting.

### PM2 Process Management
All services are managed via PM2 using `ecosystem.config.ts`. Services include:
- twitch-monitor
- discord-monitor
- event-monitor
- orchestrator (starts with delay to ensure monitors are ready)

### Package Management
This is a pnpm monorepo with workspaces defined in `pnpm-workspace.yaml`:
- packages/* - Shared packages
- monitors/* - Platform monitors
- tools/* - MCP tools
- orchestrator - Main coordinator
- shared - Common utilities

### TypeScript Configuration
All packages extend shared TypeScript configs from `config/tsconfig/`:
- base.json - Common settings
- app.json - Application settings
- library.json - Library settings

### Logging
Structured logging using Winston with separate logs for each service in `./logs/`
Agent-specific logging tracks Claude instance activities.