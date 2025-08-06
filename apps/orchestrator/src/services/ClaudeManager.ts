import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { getLogger } from '@rusty-butter/logger';
import { ClaudeConfig, ClaudeInstance, Event, LLMProvider } from '../types';
import { getConfig } from '../config';
import { EventEmitter } from 'events';

const logger = getLogger('claude-manager');

export class ClaudeManager extends EventEmitter {
  private activeClaudes: Map<string, ClaudeInstance> = new Map();
  
  constructor() {
    super();
  }

  async spawnClaude(claudeConfig: ClaudeConfig, eventId: string, parentId?: string): Promise<{ instanceId: string; response?: string }> {
    const claudeId = `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info(`Spawning Claude instance ${claudeId} with role: ${claudeConfig.role}`);
    // Create MCP config with SSE servers
    const mcpConfigPath = '/tmp/mcp-' + claudeId + '.json';
    const mcpConfig = this.buildMCPConfigWithSSE(claudeConfig.mcpServers);
    await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    logger.info(`Using MCP config at ${mcpConfigPath} with servers: ${claudeConfig.mcpServers.join(', ')}`);

    // Get config for port
    const config = await getConfig();
    
    // Build environment variables
    const env: any = {
      ...process.env,
      ORCHESTRATOR_URL: `http://localhost:${config.port}`,
      CLAUDE_INSTANCE_ID: claudeId,
      CLAUDE_ROLE: claudeConfig.role,
      EVENT_ID: eventId
    };

    // Note: We don't set ANTHROPIC_API_KEY or ANTHROPIC_BASE_URL because 
    // Claude Code is already configured with its own authentication.
    // The Claude instance will use whatever API key was set when Claude Code was installed.
    
    const provider = this.determineLLMProvider(eventId);
    if (provider !== 'anthropic') {
      // For non-Anthropic providers, we might route through a proxy in the future
      logger.info(`📝 Task suggests using ${provider} provider, but Claude Code will handle routing`);
    } else {
      logger.info('🏠 Using Claude (Anthropic) - Claude Code handles authentication');
    }

    logger.info(`🌍 Environment variables for ${claudeId}:`);
    logger.info(`  - ORCHESTRATOR_URL: ${env.ORCHESTRATOR_URL}`);
    logger.info(`  - CLAUDE_INSTANCE_ID: ${env.CLAUDE_INSTANCE_ID}`);
    logger.info(`  - CLAUDE_ROLE: ${env.CLAUDE_ROLE}`);
    logger.info(`  - EVENT_ID: ${env.EVENT_ID}`);
    logger.info(`  - ANTHROPIC_API_KEY: ${env.ANTHROPIC_API_KEY ? 'SET (' + env.ANTHROPIC_API_KEY.substring(0, 8) + '...)' : 'MISSING'}`);

    // Build allowed tools list
    const allowedTools = this.buildAllowedToolsList(claudeConfig.mcpServers);
    
    // Build Claude CLI arguments
    const claudeArgs = [
      '--mcp-config', mcpConfigPath,
      '--verbose'
    ];
    
    // Add allowed tools if specified AND if there are MCP servers
    // Don't add allowedTools for brain routing (no MCP servers)
    if (allowedTools.length > 0 && claudeConfig.mcpServers.length > 0) {
      claudeArgs.push('--allowedTools', allowedTools.join(','));
    }
    
    // Add the prompt using -p flag
    claudeArgs.push('-p', claudeConfig.prompt);
    
    logger.info(`🛠️  Spawning Claude with allowed tools: ${allowedTools.join(', ')}`);
    logger.info(`⚙️  Claude arguments (without prompt): ${claudeArgs.slice(0, -2).join(' ')}`);
    logger.info(`📄 MCP config: ${mcpConfigPath}`);
    
    // Log the actual command for debugging
    if (claudeConfig.role === 'orchestrator-brain') {
      logger.info(`🧠 Brain routing mode - no MCP tools, shorter timeout (10s)`);
      logger.debug(`Full command: claude ${claudeArgs.join(' ')}`);
      logger.debug(`Prompt length: ${claudeConfig.prompt.length} characters`);
    }

    // Spawn Claude process
    logger.info(`🚀 Executing: claude ${claudeArgs.slice(0, -1).join(' ')} -p [PROMPT]`);
    const claudeProcess = spawn('claude', claudeArgs, {
      env,
      detached: claudeConfig.detached || false,
      stdio: claudeConfig.detached ? 'ignore' : ['pipe', 'pipe', 'pipe']
    });

    logger.info(`✨ Claude process spawned with PID: ${claudeProcess.pid}`);
    
    // Close stdin immediately since we're using -p flag with the prompt
    if (claudeProcess.stdin) {
      claudeProcess.stdin.end();
      logger.debug(`Closed stdin for ${claudeId} (using -p flag)`);
    }

    // Create instance record
    const instance: ClaudeInstance = {
      id: claudeId,
      eventId,
      role: claudeConfig.role,
      status: 'running',
      process: claudeProcess,
      startTime: new Date(),
      parentId,
      children: [],
      output: [] // Store output
    };

    this.activeClaudes.set(claudeId, instance);

    // Handle process output and exit
    if (!claudeConfig.detached) {
      claudeProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          logger.info(`[${claudeId}] OUTPUT: ${output.substring(0, 200)}`);
          instance.output?.push(output);
        }
      });

      claudeProcess.stderr?.on('data', (data) => {
        logger.error(`[${claudeId}] ${data.toString().trim()}`);
      });
    }

    claudeProcess.on('error', (error) => {
      logger.error(`Claude instance ${claudeId} failed to spawn:`, error);
      // Immediately remove failed instances
      const instance = this.activeClaudes.get(claudeId);
      if (instance) {
        instance.status = 'failed';
        // Remove after a short delay to allow status queries
        setTimeout(() => {
          this.activeClaudes.delete(claudeId);
          logger.debug(`Removed failed instance ${claudeId}`);
        }, 1000);
      }
    });

    // Only register exit handler for detached processes
    if (claudeConfig.detached) {
      claudeProcess.on('exit', (code, signal) => {
        logger.info(`Claude instance ${claudeId} exited with code ${code} signal ${signal}`);
        const instance = this.activeClaudes.get(claudeId);
        if (instance) {
          instance.status = code === 0 ? 'completed' : 'failed';
          this.emit('claude-exited', {
            id: claudeId,
            eventId,
            exitCode: code,
            duration: instance ? Date.now() - instance.startTime.getTime() : 0
          });
          
          // Remove completed/failed instances after a short delay
          setTimeout(() => {
            this.activeClaudes.delete(claudeId);
            logger.debug(`Removed exited instance ${claudeId} (code: ${code})`);
          }, 5000); // Keep for 5 seconds for status queries
        }
      });
    }

    // If detached, return immediately
    if (claudeConfig.detached) {
      return { instanceId: claudeId };
    }

    // For non-detached, wait for completion and return response
    return new Promise((resolve, reject) => {
      // Use shorter timeout for brain routing (10s) vs regular processing (120s)
      const timeoutMs = claudeConfig.role === 'orchestrator-brain' ? 10000 : 120000;
      const timeout = setTimeout(() => {
        logger.warn(`Claude instance ${claudeId} timed out after ${timeoutMs}ms`);
        claudeProcess.kill('SIGTERM');
        reject(new Error(`Claude instance ${claudeId} timed out`));
      }, timeoutMs);

      claudeProcess.on('exit', (code, signal) => {
        clearTimeout(timeout);
        logger.info(`Claude instance ${claudeId} exited with code ${code} signal ${signal}`);
        const response = instance.output?.join('\n') || '';
        
        // Update instance status
        instance.status = code === 0 ? 'completed' : 'failed';
        
        // Emit event for monitoring
        this.emit('claude-exited', {
          id: claudeId,
          eventId,
          exitCode: code,
          duration: Date.now() - instance.startTime.getTime()
        });
        
        // Clean up instance after a delay
        setTimeout(() => {
          this.activeClaudes.delete(claudeId);
          logger.debug(`Removed instance ${claudeId} after completion`);
        }, 5000);
        
        if (code === 0) {
          resolve({ instanceId: claudeId, response });
        } else {
          reject(new Error(`Claude instance ${claudeId} failed with code ${code}`));
        }
      });

      claudeProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async waitForClaudeCompletion(instanceId: string, timeoutMs: number = 60000): Promise<void> {
    return new Promise((resolve, reject) => {
      const instance = this.activeClaudes.get(instanceId);
      if (!instance) {
        reject(new Error(`Claude instance ${instanceId} not found`));
        return;
      }

      // If already completed or failed, resolve immediately
      if (instance.status === 'completed' || instance.status === 'failed') {
        logger.debug(`Instance ${instanceId} already ${instance.status}`);
        resolve();
        return;
      }

      // If no process (shouldn't happen with real spawning), reject
      if (!instance.process) {
        reject(new Error(`Claude instance ${instanceId} has no process`));
        return;
      }

      const timeout = setTimeout(() => {
        logger.warn(`Claude instance ${instanceId} timed out after ${timeoutMs}ms - forcing termination`);
        
        // Force kill the hanging process
        if (instance.process && !instance.process.killed) {
          try {
            logger.info(`Forcibly terminating hanging Claude instance ${instanceId}`);
            instance.process.kill('SIGKILL');
            instance.status = 'failed';
          } catch (error) {
            logger.error(`Failed to kill Claude process ${instanceId}:`, error);
          }
        }
        
        reject(new Error(`Claude instance ${instanceId} timed out`));
      }, timeoutMs);

      instance.process.on('exit', (code: number | null) => {
        clearTimeout(timeout);
        logger.info(`Claude instance ${instanceId} completed with exit code ${code}`);
        resolve();
      });

      if (instance.process.killed || instance.status !== 'running') {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  private determineLLMProvider(eventId: string): LLMProvider {
    // Get the event from history to determine provider
    // For now, let's use different providers based on event type patterns
    
    // Chat messages should use OpenAI for better conversational ability
    if (eventId.includes('chat') || eventId.includes('message')) {
      return 'openai';
    }
    
    // Twitter events should use Grok for X.AI integration
    if (eventId.includes('twitter') || eventId.includes('tweet')) {
      return 'grok';
    }
    
    // Quick responses can use Gemini for speed
    if (eventId.includes('quick') || eventId.includes('notification')) {
      return 'gemini';
    }
    
    // Default to Anthropic for coding and complex tasks
    return 'anthropic';
  }

  private getProxyUrl(provider: LLMProvider): string {
    const proxyPorts: Record<string, number> = {
      openai: 8744,
      gemini: 8745,
      grok: 8746,
      groq: 8747
    };
    return `http://localhost:${proxyPorts[provider] || 8744}/v1`;
  }

  private getApiKeyForProvider(provider: LLMProvider): string {
    switch (provider) {
      case 'openai':
        return process.env.OPENAI_API_KEY || '';
      case 'gemini':
        return process.env.GEMINI_API_KEY || '';
      case 'grok':
        return process.env.GROK_API_KEY || '';
      case 'groq':
        return process.env.GROQ_API_KEY || '';
      default:
        return process.env.ANTHROPIC_API_KEY || '';
    }
  }

  private buildMCPConfigWithSSE(servers: string[]): any {
    const mcpServers: Record<string, any> = {};
    
    // Only include semantic-memory if explicitly requested
    if (servers.includes('semantic-memory')) {
      mcpServers['semantic-memory'] = {
        type: 'sse',
        url: 'http://localhost:8750/sse'
      };
    }
    
    for (const serverName of servers) {
      switch (serverName) {
        case 'elevenlabs':
          mcpServers['elevenlabs'] = {
            type: 'sse',
            url: 'http://localhost:3454/sse'
          };
          break;
          
        case 'avatar':
          mcpServers['rustybutter-avatar'] = {
            type: 'sse', 
            url: 'http://localhost:8080/sse'
          };
          break;
          
        case 'playwright':
          mcpServers['playwright-sse'] = {
            type: 'sse',
            url: 'http://localhost:8081/sse'
          };
          break;
          
        case 'semantic-memory':
          // Already added above
          break;
          
        default:
          logger.warn(`Unknown server: ${serverName}`);
      }
    }
    
    return { mcpServers };
  }

  private buildAllowedToolsList(servers: string[]): string[] {
    const allowedTools: string[] = [];
    
    // Add basic tools that should always be allowed
    allowedTools.push('Bash(*)', 'Read', 'Write', 'Edit', 'MultiEdit', 'WebFetch', 'WebSearch');
    
    // Only add semantic-memory tools if semantic-memory is in the servers list
    if (servers.includes('semantic-memory')) {
      allowedTools.push(
        'mcp__semantic-memory__embed_text',
        'mcp__semantic-memory__semantic_search',
        'mcp__semantic-memory__recall',
        'mcp__semantic-memory__get_stats'
      );
    }
    
    // Add MCP server tools based on requested servers
    for (const serverName of servers) {
      switch (serverName) {
        case 'elevenlabs':
          allowedTools.push(
            'mcp__elevenlabs__generate_audio',
            'mcp__elevenlabs__stream_audio',
            'mcp__elevenlabs__list_voices'
          );
          break;
          
        case 'avatar':
          allowedTools.push(
            'mcp__rustybutter-avatar__setAvatarExpression',
            'mcp__rustybutter-avatar__listAvatarExpressions',
            'mcp__rustybutter-avatar__setBatchExpressions',
            'mcp__rustybutter-avatar__getAvatarStatus',
            'mcp__rustybutter-avatar__getAvatarWebInterface'
          );
          break;
          
        case 'playwright':
          allowedTools.push(
            'mcp__playwright-sse__*'
          );
          break;
          
        case 'semantic-memory':
          // Already added above
          break;
      }
    }
    
    return allowedTools;
  }

  getActiveClaudes(): ClaudeInstance[] {
    return Array.from(this.activeClaudes.values());
  }

  getClaudeInstance(id: string): ClaudeInstance | undefined {
    return this.activeClaudes.get(id);
  }

  cleanup() {
    // Clean up old completed instances
    const now = Date.now();
    for (const [id, instance] of this.activeClaudes.entries()) {
      if (instance.status !== 'running') {
        const age = now - instance.startTime.getTime();
        if (age > 60000) { // Remove after 1 minute
          this.activeClaudes.delete(id);
        }
      } else {
        // Check if process is actually still running
        try {
          process.kill(instance.process.pid, 0);
        } catch (e) {
          // Process doesn't exist, mark as failed and remove
          logger.info(`Cleaning up dead instance ${id}`);
          instance.status = 'failed';
          this.activeClaudes.delete(id);
        }
      }
    }
  }

  clearAll() {
    // Force clear all instances
    for (const [id, instance] of this.activeClaudes.entries()) {
      if (instance.status === 'running' && instance.process.pid) {
        try {
          process.kill(instance.process.pid, 'SIGTERM');
        } catch (e) {
          // Process already dead
        }
      }
    }
    this.activeClaudes.clear();
    logger.info('Cleared all Claude instances');
  }
}