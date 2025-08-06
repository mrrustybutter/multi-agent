/**
 * @fileoverview Centralized port configuration management
 * 
 * This module provides utilities to read and manage port configurations
 * for all services in the multi-agent system.
 * 
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';

export interface PortConfiguration {
  core: {
    orchestrator: number;
    claude_proxy: number;
    dashboard: number;
  };
  tools: {
    discord_tools: number;
    playwright_sse: number;
  };
  external: {
    avatar_server: number;
    obs_websocket: number;
  };
  ranges: {
    core_services: { start: number; end: number };
    mcp_tools: { start: number; end: number };
    external_integrations: { start: number; end: number };
  };
  services: Record<string, number>;
}

let portConfig: PortConfiguration | null = null;

/**
 * Load port configuration from config/ports.json
 */
function loadPortConfig(): PortConfiguration {
  if (portConfig) {
    return portConfig;
  }

  try {
    const configPath = path.join(process.cwd(), 'config', 'ports.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    portConfig = JSON.parse(configData);
    return portConfig!;
  } catch (error) {
    console.warn('Failed to load port configuration, using defaults:', error);
    
    // Fallback to default configuration
    portConfig = {
      core: {
        orchestrator: 8742,
        claude_proxy: 8743,
        dashboard: 3458
      },
      tools: {
        discord_tools: 3457,
        playwright_sse: 3456
      },
      external: {
        avatar_server: 8080,
        obs_websocket: 4455
      },
      ranges: {
        core_services: { start: 8740, end: 8749 },
        mcp_tools: { start: 3450, end: 3459 },
        external_integrations: { start: 8080, end: 8089 }
      },
      services: {
        orchestrator: 8742,
        claude_proxy: 8743,
        dashboard: 3458,
        discord_tools: 3457,
        playwright_sse: 3456,
        avatar_server: 8080,
        obs_websocket: 4455
      }
    };
    
    return portConfig;
  }
}

/**
 * Get port for a specific service
 * Falls back to environment variable, then config file, then default
 */
export function getPort(service: string, defaultPort?: number): number {
  const config = loadPortConfig();
  
  // Check environment variable first (format: SERVICE_NAME_PORT)
  const envVarName = `${service.toUpperCase().replace('-', '_')}_PORT`;
  const envPort = process.env[envVarName];
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (!isNaN(port)) {
      return port;
    }
  }

  // Check services mapping in config
  if (config.services[service]) {
    return config.services[service];
  }

  // Check specific service categories
  if (service === 'orchestrator') return config.core.orchestrator;
  if (service === 'claude-proxy' || service === 'claude_proxy') return config.core.claude_proxy;
  if (service === 'dashboard') return config.core.dashboard;
  if (service === 'discord-tools' || service === 'discord_tools') return config.tools.discord_tools;
  if (service === 'playwright-sse' || service === 'playwright_sse') return config.tools.playwright_sse;
  if (service === 'avatar-server' || service === 'avatar_server') return config.external.avatar_server;
  if (service === 'obs-websocket' || service === 'obs_websocket') return config.external.obs_websocket;
  if (service === 'twitch-chat' || service === 'twitch_chat') return 3455;
  if (service === 'elevenlabs') return 3454;
  if (service === 'twitter') return 3453;
  if (service === 'obs-tools' || service === 'obs_tools') return 3452;

  // Use provided default or throw error
  if (defaultPort !== undefined) {
    return defaultPort;
  }

  throw new Error(`No port configuration found for service: ${service}`);
}

/**
 * Get all configured ports
 */
export function getAllPorts(): Record<string, number> {
  const config = loadPortConfig();
  return { ...config.services };
}

/**
 * Check if a port is within a specific range
 */
export function isPortInRange(port: number, rangeType: keyof PortConfiguration['ranges']): boolean {
  const config = loadPortConfig();
  const range = config.ranges[rangeType];
  return port >= range.start && port <= range.end;
}

/**
 * Get next available port in a range
 */
export function getNextAvailablePort(rangeType: keyof PortConfiguration['ranges']): number {
  const config = loadPortConfig();
  const range = config.ranges[rangeType];
  const usedPorts = new Set(Object.values(config.services));
  
  for (let port = range.start; port <= range.end; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }
  
  throw new Error(`No available ports in range ${rangeType} (${range.start}-${range.end})`);
}

/**
 * Validate that all configured ports don't conflict
 */
export function validatePortConfiguration(): { valid: boolean; conflicts: string[] } {
  const config = loadPortConfig();
  const portToService = new Map<number, string[]>();
  const conflicts: string[] = [];

  // Collect all port assignments
  Object.entries(config.services).forEach(([service, port]) => {
    if (!portToService.has(port)) {
      portToService.set(port, []);
    }
    portToService.get(port)!.push(service);
  });

  // Find conflicts
  portToService.forEach((services, port) => {
    if (services.length > 1) {
      conflicts.push(`Port ${port} is assigned to multiple services: ${services.join(', ')}`);
    }
  });

  return {
    valid: conflicts.length === 0,
    conflicts
  };
}

/**
 * Environment variable helpers
 */
export const PortEnvVars = {
  ORCHESTRATOR_PORT: () => getPort('orchestrator'),
  CLAUDE_PROXY_PORT: () => getPort('claude-proxy'),
  DASHBOARD_PORT: () => getPort('dashboard'),
  DISCORD_TOOLS_PORT: () => getPort('discord-tools'),
  PLAYWRIGHT_SSE_PORT: () => getPort('playwright-sse'),
  AVATAR_SERVER_PORT: () => getPort('avatar-server'),
  OBS_WEBSOCKET_PORT: () => getPort('obs-websocket')
} as const;