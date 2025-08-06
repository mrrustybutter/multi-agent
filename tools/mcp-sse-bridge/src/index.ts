#!/usr/bin/env node

/**
 * MCP SSE Bridge - Converts SSE-based MCP servers to command-based MCP servers
 * 
 * This bridge connects to SSE MCP servers via HTTP and exposes their tools
 * as a standard command-based MCP server that Claude Code can use.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import EventSource from 'eventsource';
import fetch from 'node-fetch';

// Configuration for SSE MCP servers
interface SSEServerConfig {
  name: string;
  port: number; // HTTP API port  
  tools: ToolConfig[];
}

interface ToolConfig {
  name: string;
  description: string;
  endpoint: string;
  inputSchema: any;
}

const SSE_SERVERS: SSEServerConfig[] = [
  {
    name: 'elevenlabs',
    port: 3454,
    tools: [
      {
        name: 'generate_audio',
        description: 'Generate speech audio from text using ElevenLabs',
        endpoint: '/tools/generate_audio',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text to convert to speech' },
            voice_id: { type: 'string', description: 'Voice ID to use (optional)' },
            model_id: { type: 'string', description: 'Model ID to use (optional)' }
          },
          required: ['text']
        }
      },
      {
        name: 'stream_audio',
        description: 'Stream and play audio with real-time buffering for lower latency',
        endpoint: '/tools/stream_audio',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text to convert to speech' },
            voice_id: { type: 'string', description: 'Voice ID to use (optional)' },
            model_id: { type: 'string', description: 'Model ID to use (optional)' },
            buffer_size: { type: 'number', description: 'Buffer size in bytes before starting playback (default: 1024)' }
          },
          required: ['text']
        }
      },
      {
        name: 'list_voices',
        description: 'List available ElevenLabs voices',
        endpoint: '/tools/list_voices',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  },
  {
    name: 'rustybutter-avatar',
    port: 8080,
    tools: [
      {
        name: 'setAvatarExpression',
        description: 'Changes the avatar\'s expression and visual properties',
        endpoint: '/api/set-expression',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Expression name (one of the available avatar expressions)' },
            direction: { type: 'string', enum: ['left', 'right'], description: 'Direction the avatar is facing' },
            posX: { type: 'number', description: 'Horizontal position offset in pixels' },
            posY: { type: 'number', description: 'Vertical position offset in pixels' },
            rotation: { type: 'number', description: 'Rotation angle in degrees (-30 to 30) for leaning effect' },
            scale: { type: 'number', description: 'Scale factor for avatar size (0.1 to 3.0, where 1.0 is 100%)' }
          },
          required: ['name']
        }
      },
      {
        name: 'listAvatarExpressions',
        description: 'Returns a list of all available avatar expressions',
        endpoint: '/api/expressions',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'setBatchExpressions',
        description: 'Sets up an animated sequence of expressions',
        endpoint: '/api/set-batch-expressions',
        inputSchema: {
          type: 'object',
          properties: {
            loop: { type: 'boolean', description: 'Whether to loop through the expressions sequence' },
            random: { type: 'boolean', description: 'Whether to randomize the order of expressions after each loop' },
            actions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  expression: { type: 'string', description: 'Expression name' },
                  duration: { type: 'number', description: 'Duration to display this expression in milliseconds' },
                  direction: { type: 'string', enum: ['left', 'right'], description: 'Direction the avatar is facing' },
                  posX: { type: 'number', description: 'Horizontal position offset in pixels' },
                  posY: { type: 'number', description: 'Vertical position offset in pixels' },
                  rotation: { type: 'number', description: 'Rotation angle in degrees (-30 to 30)' },
                  scale: { type: 'number', description: 'Scale factor for avatar size (0.1 to 3.0)' }
                },
                required: ['expression', 'duration']
              },
              description: 'Array of expression actions with durations'
            }
          },
          required: ['loop', 'actions']
        }
      },
      {
        name: 'getAvatarStatus',
        description: 'Gets the current status of the avatar server',
        endpoint: '/api/status',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'getAvatarWebInterface',
        description: 'Returns the URL for the web interface and OBS setup instructions',
        endpoint: '/api/status',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  }
];

class MCPSSEBridge {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: 'mcp-sse-bridge', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List all tools from all configured SSE servers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const allTools: Tool[] = [];
      
      for (const serverConfig of SSE_SERVERS) {
        // Prefix tool names with server name to avoid conflicts
        const prefixedTools = serverConfig.tools.map(tool => ({
          name: `${serverConfig.name}__${tool.name}`,
          description: `[${serverConfig.name}] ${tool.description}`,
          inputSchema: tool.inputSchema
        }));
        allTools.push(...prefixedTools);
      }

      return { tools: allTools };
    });

    // Handle tool calls by routing to appropriate SSE server
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      // Parse server name from prefixed tool name
      const [serverName, ...toolNameParts] = name.split('__');
      const originalToolName = toolNameParts.join('__');
      
      const serverConfig = SSE_SERVERS.find(s => s.name === serverName);
      const toolConfig = serverConfig?.tools.find(t => t.name === originalToolName);
      
      if (!serverConfig || !toolConfig) {
        return {
          content: [{ type: 'text', text: `Tool ${name} not found` }],
          isError: true
        };
      }

      try {
        console.error(`Calling tool ${originalToolName} on ${serverName} server`);
        
        // Make HTTP request to the SSE server's tool endpoint
        const response = await fetch(`http://localhost:${serverConfig.port}${toolConfig.endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args)
        });

        const result = await response.json() as any;
        
        if (!response.ok) {
          return {
            content: [{ type: 'text', text: `Error: ${result.error?.message || response.statusText}` }],
            isError: true
          };
        }

        // Special handling for getAvatarWebInterface
        if (originalToolName === 'getAvatarWebInterface') {
          const port = serverConfig.port;
          return {
            content: [{
              type: 'text',
              text: `RustyButter Avatar Web Interface\n\n` +
                    `🌐 Web Interface URL: http://localhost:${port}\n` +
                    `📺 OBS Browser Source URL: http://localhost:${port}\n\n` +
                    `Setup for OBS:\n` +
                    `1. Add a Browser Source in OBS\n` +
                    `2. Set URL to: http://localhost:${port}\n` +
                    `3. Set Width: 800, Height: 600 (or as needed)\n` +
                    `4. Check "Refresh browser when scene becomes active"\n\n` +
                    `The avatar will automatically update when you use the MCP tools to change expressions!`
            }]
          };
        }
        
        // Special handling for listAvatarExpressions
        if (originalToolName === 'listAvatarExpressions' && Array.isArray(result)) {
          const expressionNames = result.map((exp: any) => exp.name).join(', ');
          return {
            content: [{ type: 'text', text: `Available expressions: ${expressionNames}` }]
          };
        }
        
        // Special handling for setBatchExpressions
        if (originalToolName === 'setBatchExpressions' && result.success) {
          return {
            content: [{ 
              type: 'text', 
              text: `Batch expressions set with ${result.actionCount} actions, loop=${result.loop}` 
            }]
          };
        }
        
        // Return the result in MCP format
        if (result.result) {
          return {
            content: [{ type: 'text', text: `${originalToolName} executed: ${result.result.message || 'Success'}` }]
          };
        } else if (result.success) {
          return {
            content: [{ type: 'text', text: `Avatar expression set to ${result.expression || 'unknown'}` }]
          };
        } else {
          return {
            content: [{ type: 'text', text: `${originalToolName} executed successfully` }]
          };
        }
      } catch (error) {
        console.error(`Error calling tool ${name}:`, error);
        return {
          content: [{ type: 'text', text: `Error calling ${name}: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    });
  }

  async start() {
    // Test connectivity to all configured SSE servers
    for (const serverConfig of SSE_SERVERS) {
      try {
        const healthCheck = await fetch(`http://localhost:${serverConfig.port}/health`, {
          method: 'GET',
          timeout: 2000
        } as any);
        
        if (healthCheck.ok) {
          console.error(`✓ Connected to ${serverConfig.name} server on port ${serverConfig.port}`);
        } else {
          console.error(`⚠ ${serverConfig.name} server health check failed`);
        }
      } catch (error) {
        console.error(`✗ Failed to connect to ${serverConfig.name} server on port ${serverConfig.port}`);
      }
    }

    // Start the MCP server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('MCP SSE Bridge started - ready to proxy tool calls to SSE servers');
  }

  async stop() {
    await this.server.close();
    console.error('MCP SSE Bridge stopped');
  }
}

// Handle process termination
const bridge = new MCPSSEBridge();

process.on('SIGINT', async () => {
  console.error('Received SIGINT, shutting down...');
  await bridge.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Received SIGTERM, shutting down...');
  await bridge.stop();
  process.exit(0);
});

// Start the bridge
bridge.start().catch(error => {
  console.error('Failed to start MCP SSE Bridge:', error);
  process.exit(1);
});