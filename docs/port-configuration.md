# Port Configuration Management

This document describes the centralized port configuration system for the multi-agent project.

## Overview

The multi-agent system uses a centralized port configuration to avoid port conflicts and simplify service management. All port assignments are managed through:

1. **Central Configuration File**: `config/ports.json`
2. **Environment Variables**: `.env` file with standardized port variables
3. **TypeScript Utility**: `@rusty-butter/shared` package provides `getPort()` function

## Port Allocation Strategy

### Port Ranges

The system uses specific port ranges for different service types:

- **Core Services** (8740-8749): Central orchestration services
  - 8742: Orchestrator API
  - 8743: Claude Code Proxy
  
- **MCP Tools** (3450-3459): Model Context Protocol tool servers
  - 3456: Playwright SSE
  - 3457: Discord Tools
  - 3458: Dashboard Server
  
- **External Integrations** (8080-8089): External service connections
  - 8080: Avatar Server (rusty-butter project)
  - 4455: OBS WebSocket (standard OBS port)

## Configuration Files

### config/ports.json

Central configuration file that defines all service ports:

```json
{
  "services": {
    "orchestrator": 8742,
    "claude_proxy": 8743,
    "dashboard": 3458,
    "discord_tools": 3457,
    "playwright_sse": 3456,
    "avatar_server": 8080,
    "obs_websocket": 4455
  }
}
```

### Environment Variables (.env)

Standardized environment variables for each service:

```bash
# Core Services
ORCHESTRATOR_PORT=8742
CLAUDE_PROXY_PORT=8743
DASHBOARD_PORT=3458

# MCP Tool Servers
DISCORD_TOOLS_PORT=3457
PLAYWRIGHT_SSE_PORT=3456

# External Services
AVATAR_SERVER_PORT=8080
```

## Usage in Code

### TypeScript Services

Services import and use the `getPort()` function:

```typescript
import { getPort } from '@rusty-butter/shared';

// Get port with fallback to config file
const port = getPort('orchestrator');

// Get port with custom default
const port = getPort('custom-service', 9000);
```

### Port Resolution Priority

The `getPort()` function resolves ports in this order:

1. **Environment Variable**: `SERVICE_NAME_PORT` (e.g., `ORCHESTRATOR_PORT`)
2. **Configuration File**: Value from `config/ports.json`
3. **Default Value**: Provided as second parameter to `getPort()`

### Examples

```typescript
// Orchestrator service
const config = {
  port: getPort('orchestrator'),  // Resolves to 8742
  proxyUrl: `http://localhost:${getPort('claude-proxy')}` // Resolves to :8743
};

// Dashboard server
const PORT = getPort('dashboard');  // Resolves to 3458
server.listen(PORT, () => {
  logger.info(`Dashboard server running on port ${PORT}`);
});
```

## Service Directory

| Service | Port | Description | Type |
|---------|------|-------------|------|
| orchestrator | 8742 | Main orchestrator API server | Core |
| claude-proxy | 8743 | Claude Code proxy server | Core |
| dashboard | 3458 | WebSocket dashboard server | Core |
| discord-tools | 3457 | Discord automation MCP server | Tool |
| playwright-sse | 3456 | Browser automation with SSE | Tool |
| avatar-server | 8080 | RustyButter avatar HTTP server | External |
| obs-websocket | 4455 | OBS WebSocket connection | External |

## Adding New Services

To add a new service:

1. **Choose Port Range**: Select appropriate range based on service type
2. **Update config/ports.json**: Add service to `services` object
3. **Update .env**: Add environment variable `SERVICE_NAME_PORT=XXXX`
4. **Use in Code**: Call `getPort('service-name')` in your service
5. **Add Dependencies**: Ensure service has `@rusty-butter/shared` dependency

Example for new service:

```json
// config/ports.json
{
  "services": {
    "my_new_service": 3459
  }
}
```

```bash
# .env
MY_NEW_SERVICE_PORT=3459
```

```typescript
// my-service.ts
import { getPort } from '@rusty-butter/shared';

const port = getPort('my_new_service');
```

## Validation

Use the validation utilities to check for port conflicts:

```typescript
import { validatePortConfiguration } from '@rusty-butter/shared';

const validation = validatePortConfiguration();
if (!validation.valid) {
  console.error('Port conflicts found:', validation.conflicts);
}
```

## Benefits

1. **No Port Conflicts**: Centralized management prevents accidental conflicts
2. **Easy Development**: Change ports in one place for all services
3. **Environment Flexibility**: Override ports via environment variables
4. **Documentation**: Clear overview of all service ports
5. **Type Safety**: TypeScript support with autocompletion

## Migration Guide

For existing services:

1. Add `@rusty-butter/shared` dependency to package.json
2. Replace hardcoded ports with `getPort('service-name')`
3. Add service to config/ports.json
4. Run `pnpm install` and `pnpm build`

## Troubleshooting

### Common Issues

**Build Error**: "Cannot find module '@rusty-butter/shared'"
- Solution: Add `"@rusty-butter/shared": "workspace:*"` to dependencies

**Port Already in Use**: 
- Check config/ports.json for conflicts
- Use `validatePortConfiguration()` to find conflicts
- Kill existing processes: `lsof -ti :PORT | xargs kill -9`

**Environment Override Not Working**:
- Ensure environment variable format: `SERVICE_NAME_PORT`
- Use underscores, not dashes in variable names
- Restart services after changing .env

### Debugging

```typescript
import { getAllPorts, validatePortConfiguration } from '@rusty-butter/shared';

// Show all configured ports
console.log('All ports:', getAllPorts());

// Validate configuration
const validation = validatePortConfiguration();
console.log('Validation:', validation);
```