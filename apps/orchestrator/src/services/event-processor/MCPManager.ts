import { connectToMCPServer, MCPConnection } from '@rusty-butter/shared';
import { Event } from '../../types';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('mcp-manager');

export class MCPManager {
  private mcpConnections: Map<string, MCPConnection> = new Map();

  async initialize() {
    const connections = await this.trySSEConnections();
    
    if (connections.elevenlabs) {
      this.mcpConnections.set('elevenlabs', connections.elevenlabs);
    }
    
    if (connections.avatar) {
      this.mcpConnections.set('avatar', connections.avatar);
    }
  }

  private async trySSEConnections(): Promise<{elevenlabs?: MCPConnection, avatar?: MCPConnection}> {
    const results: {elevenlabs?: MCPConnection, avatar?: MCPConnection} = {};
    
    try {
      logger.info('🔌 Attempting to connect to ElevenLabs MCP server...');
      const elevenlabs = await connectToMCPServer({
        url: 'http://localhost:3454/sse'
      } as any);
      
      if (elevenlabs) {
        results.elevenlabs = elevenlabs;
        logger.info('✅ Connected to ElevenLabs MCP server');
        
        // List available tools
        const tools = await elevenlabs.client.listTools();
        logger.info(`📦 ElevenLabs tools available: ${tools.tools.map(t => t.name).join(', ')}`);
      }
    } catch (error) {
      logger.warn('⚠️ Could not connect to ElevenLabs MCP:', error);
    }
    
    try {
      logger.info('🔌 Attempting to connect to Avatar MCP server...');
      const avatar = await connectToMCPServer({
        url: 'http://localhost:8080/sse'
      } as any);
      
      if (avatar) {
        results.avatar = avatar;
        logger.info('✅ Connected to Avatar MCP server');
        
        // List available tools
        const tools = await avatar.client.listTools();
        logger.info(`📦 Avatar tools available: ${tools.tools.map(t => t.name).join(', ')}`);
      }
    } catch (error) {
      logger.warn('⚠️ Could not connect to Avatar MCP:', error);
    }
    
    return results;
  }

  getConnection(name: string): MCPConnection | undefined {
    return this.mcpConnections.get(name);
  }

  getAllConnections(): Map<string, MCPConnection> {
    return this.mcpConnections;
  }

  determineRequiredMCPServers(event: Event): string[] {
    const servers: string[] = ['semantic-memory']; // Always include memory
    
    // Voice events need ElevenLabs and Avatar
    if (event.type === 'voice_message' || event.data?.requiresVoice) {
      servers.push('elevenlabs', 'avatar');
    }
    
    // Browser automation events need Playwright
    if (event.data?.requiresBrowser || event.type === 'browser_action') {
      servers.push('playwright');
    }
    
    // Avatar expression events
    if (event.data?.requiresAvatar || event.type === 'avatar_expression') {
      servers.push('avatar');
    }
    
    return servers;
  }

  async cleanup() {
    for (const [name, connection] of this.mcpConnections.entries()) {
      try {
        // Close connection if method exists
        if ('close' in connection && typeof connection.close === 'function') {
          await connection.close();
        }
        logger.info(`🔌 Disconnected from ${name} MCP server`);
      } catch (error) {
        logger.error(`Failed to disconnect from ${name}:`, error);
      }
    }
    this.mcpConnections.clear();
  }
}