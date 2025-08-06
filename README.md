# Rusty Butter Multi-Agent System

A sophisticated multi-agent AI system that coordinates Claude instances across various platforms for autonomous streaming, content creation, and community interaction.

## 🏗️ Project Structure

This is a **professional monorepo** built with industry-standard practices using:
- **pnpm workspaces** for dependency management
- **Turborepo** for build orchestration and caching
- **TypeScript** with project references for type safety
- **PM2** for process management in production

```
multi-agent/
├── apps/                    # Deployable applications
│   ├── orchestrator/       # Central API server (port 8742)
│   ├── dashboard/          # Next.js monitoring dashboard
│   ├── dashboard-server/   # Dashboard backend API
│   ├── monitors/           # Platform event monitors
│   │   ├── twitch-monitor/
│   │   ├── discord-monitor/
│   │   ├── event-monitor/
│   │   └── social-monitor/
│   └── tools/              # MCP tool servers
│       ├── discord-tools/
│       └── playwright-sse/
├── packages/               # Shared libraries
│   ├── shared/            # Common utilities and MCP connections
│   ├── logger/            # Centralized logging system
│   └── expression-mapper/ # Avatar expression mapping
├── config/                # Shared configurations
│   ├── eslint/           # ESLint rules
│   ├── prettier/         # Code formatting
│   └── tsconfig/         # TypeScript configs
├── .env.example          # Environment template
├── turbo.json           # Turborepo configuration
└── pnpm-workspace.yaml  # Workspace configuration
```

## 🚀 Quick Start

### 1. Setup Environment

```bash
# Run interactive setup wizard
./setup-env.sh

# Or manually copy and configure
cp .env.example .env
# Edit .env with your API keys
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Build All Packages

```bash
pnpm build  # Uses Turborepo for optimized builds
```

### 4. Start Services

```bash
# Start all services with PM2
pnpm start

# Check status
pnpm status

# View logs
pnpm logs
```

## 🛠️ Development

### Running Individual Services

```bash
# Run specific monitors
pnpm dev:twitch
pnpm dev:discord
pnpm dev:orchestrator

# Run all development servers
pnpm dev
```

### Build Commands

```bash
pnpm build       # Build all packages with Turborepo
pnpm typecheck   # Type check all packages
pnpm lint        # Lint all packages
pnpm test        # Run tests
pnpm clean       # Clean build artifacts
```

## 🏛️ Architecture

### System Flow

1. **Monitors** detect platform events and send them to the Orchestrator API
2. **Orchestrator** (Express API on port 8742) receives events and spawns main Claude instances
3. **Main Claude** analyzes events and can spawn specialized child Claude instances
4. **Child Claudes** execute specific tasks using MCP servers and tools
5. **Semantic Memory** persists important information across sessions

### Component Organization

Following monorepo best practices:

- **`/apps`** - Deployable applications and services
  - Each app is independently deployable
  - Contains entry points and application-specific logic
  
- **`/packages`** - Shared libraries and utilities
  - Reusable across multiple apps
  - Published as internal packages
  
- **`/config`** - Shared configuration
  - TypeScript, ESLint, Prettier configs
  - Ensures consistency across the monorepo

### API Endpoints

The Orchestrator exposes these endpoints:

- `POST /event` - Submit new events from monitors
- `GET /status` - System status and active Claude instances
- `POST /claude/spawn` - Spawn Claude instances (used by main Claude)
- `POST /memory/embed` - Store information in semantic memory
- `GET /health` - Health check

## 📦 Technologies

### Package Management
- **pnpm workspaces** - Fast, disk-efficient package manager
- **Workspace protocol** - Internal package references
- **Single node_modules** - Hoisted dependencies for efficiency

### Build System
- **Turborepo** - High-performance build orchestration
  - Incremental builds
  - Local and remote caching
  - Parallel execution
  - Smart task scheduling

### Development Stack
- **TypeScript** - Type safety across all packages
- **Node.js** - Runtime environment
- **Express** - API framework
- **PM2** - Production process management

## 🔧 Configuration

All configuration is centralized in `.env` at the project root:

**Required:**
- `ORCHESTRATOR_PORT=8742` - API server port (obscure for security)
- `ANTHROPIC_API_KEY` - For spawning Claude instances
- `ELEVEN_API_KEY` - For text-to-speech

**Optional:**
- Platform credentials (Discord, Twitch, Social Media)
- Advanced settings (rate limits, security, etc.)

See `.env.example` for all available options.

## 📊 Monitoring

- Logs stored in `./logs/`
- Each service has separate log files
- Use `pm2 monit` for real-time monitoring
- Dashboard available for visual monitoring

## 🐛 Troubleshooting

### Services not starting
```bash
pm2 logs [service-name]  # Check specific service logs
pnpm build               # Ensure everything is built
```

### No audio output
- Verify `ELEVEN_API_KEY` is set correctly
- Check orchestrator logs for errors

### Build issues
```bash
pnpm clean:all  # Clean everything including node_modules
pnpm install    # Reinstall dependencies
pnpm build      # Rebuild all packages
```

## 📚 Documentation

- [Architecture Overview](ARCHITECTURE.md)
- [Development Guide](CLAUDE.md)
- [Dashboard Instructions](DASHBOARD_INSTRUCTIONS.md)

## 🤝 Contributing

This is an experimental autonomous streaming system. Contributions are welcome!

1. Follow the monorepo structure (`/apps` for deployables, `/packages` for libraries)
2. Use TypeScript with proper types
3. Maintain consistent code style (ESLint + Prettier)
4. Add tests for new features
5. Update documentation as needed

## 📄 License

MIT License - because sharing is caring!

---

Built with ☕ and chaos by Rusty Butter