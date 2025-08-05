/**
 * Shared MCP Connection Utilities
 * Helper functions for connecting to MCP servers
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { createLogger } from '@rusty-butter/logger';

const logger = createLogger('mcp-connection');

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPConnection {
  name: string;
  client: Client;
  transport: StdioClientTransport;
}

/**
 * Connect to an MCP server
 */
export async function connectToMCPServer(config: MCPServerConfig): Promise<MCPConnection> {
  logger.info(`Connecting to MCP server: ${config.name}`);

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args || [],
    env: {
      ...process.env,
      ...config.env
    } as Record<string, string>
  });

  const client = new Client({
    name: `${config.name}-client`,
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  await client.connect(transport);
  
  logger.info(`Connected to MCP server: ${config.name}`);
  
  return {
    name: config.name,
    client,
    transport
  };
}

/**
 * Connect to multiple MCP servers
 */
export async function connectToMultipleMCPServers(
  configs: MCPServerConfig[]
): Promise<Map<string, MCPConnection>> {
  const connections = new Map<string, MCPConnection>();
  
  for (const config of configs) {
    try {
      const connection = await connectToMCPServer(config);
      connections.set(config.name, connection);
    } catch (error) {
      logger.error(`Failed to connect to ${config.name}:`, error);
    }
  }
  
  return connections;
}

/**
 * Spawn Claude with MCP connections
 */
export async function spawnClaudeWithMCP(
  task: string,
  mcpServers: string[],
  context?: any
): Promise<void> {
  const mcpConfig = mcpServers.map(server => ({
    name: server,
    url: `stdio://localhost/${server}`
  }));

  const args = [
    'code',
    '--task', task,
    '--mcp', JSON.stringify(mcpConfig)
  ];

  const env = {
    ...process.env,
    CLAUDE_CONTEXT: context ? JSON.stringify(context) : ''
  };

  logger.info(`Spawning Claude with task: ${task}`);
  
  const claudeProcess = spawn('claude', args, {
    stdio: 'inherit',
    env
  });

  return new Promise((resolve, reject) => {
    claudeProcess.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Claude exited with code ${code}`));
      }
    });

    claudeProcess.on('error', reject);
  });
}

/**
 * Disconnect from all MCP servers
 */
export async function disconnectAll(
  connections: Map<string, MCPConnection>
): Promise<void> {
  for (const [name, connection] of connections) {
    try {
      await connection.client.close();
      logger.info(`Disconnected from ${name}`);
    } catch (error) {
      logger.error(`Error disconnecting from ${name}:`, error);
    }
  }
}