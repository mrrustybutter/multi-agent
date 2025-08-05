#!/usr/bin/env tsx

/**
 * Orchestrator - The brain of the multi-agent system
 * Receives events from monitors and spawns Claude instances to handle them
 */

import { EventEmitter } from 'eventemitter3';
import PQueue from 'p-queue';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { getLogger, getAgentLogger } from '@rusty-butter/logger';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'fs';
import os from 'os';
import { 
  connectToMultipleMCPServers, 
  MCPServerConfig,
  MCPConnection,
  disconnectAll
} from '@rusty-butter/shared/mcp-connection';
import {
  QueueManager,
  QueueMessage
} from '@rusty-butter/shared/queue-manager';

// Logger
const logger = getLogger('orchestrator');
const agentLogger = getAgentLogger('orchestrator');

// Types
interface LLMProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface TaskContext {
  taskId: string;
  eventType: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  context: any;
  requiredTools: string[];
}

interface OrchestratorConfig {
  queueDir: string;
  mcpServers: MCPServerConfig[];
  toolServers: MCPServerConfig[];
  llmProviders: LLMProvider[];
  maxConcurrentClaudes: number;
  priorityWeights: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  taskToLLM: Record<string, string>;
  taskToTools: Record<string, string[]>;
}

interface ClaudeInstance {
  id: string;
  process: ChildProcess;
  taskId: string;
  startTime: Date;
  provider: string;
}

// Configuration
const config: OrchestratorConfig = {
  queueDir: process.env.QUEUE_DIR || path.join(process.cwd(), 'queues'),
  mcpServers: [
    {
      name: 'semantic-memory',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory']
    },
    {
      name: 'rustybutter-avatar',
      command: 'node',
      args: ['/home/codingbutter/GitHub/rusty-butter/packages/rustybutter-avatar/packages/mcp-server/dist/index.js']
    },
    {
      name: 'elevenlabs',
      command: 'node',
      args: ['/home/codingbutter/GitHub/rusty-butter/packages/elevenlabs-streaming/packages/mcp-server/dist/index.js'],
      env: {
        ELEVEN_API_KEY: process.env.ELEVEN_API_KEY || ''
      }
    },
    {
      name: 'twitch-monitor',
      command: 'tsx',
      args: ['../monitors/twitch-monitor/src/index.ts']
    },
    {
      name: 'discord-monitor',
      command: 'tsx',
      args: ['../monitors/discord-monitor/src/index.ts'],
      env: {
        DISCORD_TOKEN: process.env.DISCORD_TOKEN || ''
      }
    },
    {
      name: 'event-monitor',
      command: 'tsx',
      args: ['../monitors/event-monitor/src/index.ts']
    },
    {
      name: 'social-monitor',
      command: 'tsx',
      args: ['../monitors/social-monitor/src/index.ts'],
      env: {
        X_API_KEY: process.env.X_API_KEY || '',
        X_API_SECRET_KEY: process.env.X_API_SECRET_KEY || '',
        X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN || '',
        X_ACCESS_TOKEN_SECRET: process.env.X_ACCESS_TOKEN_SECRET || '',
        X_BEARER_TOKEN: process.env.X_BEARER_TOKEN || '',
        REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID || '',
        REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET || '',
        REDDIT_USERNAME: process.env.REDDIT_USERNAME || '',
        REDDIT_PASSWORD: process.env.REDDIT_PASSWORD || ''
      }
    }
  ],
  toolServers: [
    {
      name: 'playwright-sse',
      command: 'node',
      args: ['tools/playwright-sse/dist/index.js']
    },
    {
      name: 'discord-tools',
      command: 'node',
      args: ['tools/discord-tools/dist/index.js']
    }
  ],
  llmProviders: [
    {
      name: 'anthropic',
      baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: 'claude-3-5-sonnet-20241022'
    },
    {
      name: 'openai',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-4-turbo-preview'
    },
    {
      name: 'local',
      baseUrl: process.env.LOCAL_LLM_URL || 'http://localhost:11434',
      apiKey: '',
      model: 'llama2'
    }
  ],
  maxConcurrentClaudes: 5,
  priorityWeights: {
    critical: 1000,
    high: 100,
    medium: 10,
    low: 1
  },
  // Map task types to LLM providers
  taskToLLM: {
    'code': 'anthropic',
    'chat': 'anthropic',
    'social': 'openai',
    'memory': 'local',
    'analysis': 'anthropic',
    'creative': 'openai'
  },
  // Map task types to required tools
  taskToTools: {
    'code': ['playwright-sse', 'semantic-memory'],
    'chat': ['discord-tools', 'elevenlabs', 'rustybutter-avatar'],
    'social': ['social-monitor', 'semantic-memory'],
    'memory': ['semantic-memory'],
    'analysis': ['semantic-memory', 'playwright-sse'],
    'creative': ['rustybutter-avatar', 'elevenlabs']
  }
};

class Orchestrator extends EventEmitter {
  private mcpConnections: Map<string, MCPConnection> = new Map();
  private queueManager: QueueManager;
  private actionQueue: PQueue;
  private performanceQueue: PQueue;
  private isRunning: boolean = false;
  private processedMessages: Set<string> = new Set();
  private activeClaudes: Map<string, ClaudeInstance> = new Map();

  constructor() {
    super();
    this.queueManager = new QueueManager(config.queueDir);
    // Multiple queues as suggested by CodingButter
    this.actionQueue = new PQueue({ 
      concurrency: Math.floor(config.maxConcurrentClaudes * 0.6) // 60% for coding tasks
    });
    this.performanceQueue = new PQueue({
      concurrency: Math.floor(config.maxConcurrentClaudes * 0.4) // 40% for performance/social tasks
    });
  }

  async initialize(): Promise<void> {
    logger.info('Initializing orchestrator...');

    // Connect to all MCP servers (monitors)
    logger.info('Connecting to MCP servers...');
    this.mcpConnections = await connectToMultipleMCPServers(config.mcpServers);
    logger.info(`Connected to ${this.mcpConnections.size} MCP servers`);

    // Start tool servers
    logger.info('Starting tool servers...');
    await this.startToolServers();

    // Initialize queue manager
    await this.queueManager.initialize();
    this.queueManager.on('message', this.handleQueueMessage.bind(this));

    // Start processing loop
    this.isRunning = true;
    this.startProcessingLoop();

    logger.info('Orchestrator initialized successfully');
  }

  private async startToolServers(): Promise<void> {
    for (const server of config.toolServers) {
      try {
        const toolProcess = spawn(server.command, server.args || [], {
          cwd: path.join(process.cwd(), '..'),
          env: { ...process.env, ...server.env },
          stdio: ['ignore', 'pipe', 'pipe']
        });

        toolProcess.stdout?.on('data', (data) => {
          logger.debug(`[${server.name}] ${data.toString().trim()}`);
        });

        toolProcess.stderr?.on('data', (data) => {
          logger.error(`[${server.name}] ${data.toString().trim()}`);
        });

        logger.info(`Started tool server: ${server.name}`);
      } catch (error) {
        logger.error(`Failed to start tool server ${server.name}:`, error);
      }
    }
  }

  private async handleQueueMessage(message: QueueMessage): Promise<void> {
    // Skip if already processed
    if (this.processedMessages.has(message.id)) {
      return;
    }

    logger.info(`New queue message: ${message.id} from ${message.source}`);
    
    // Calculate priority score
    const priorityScore = this.calculatePriorityScore(message);
    
    // Determine which queue to use based on task type
    const taskType = this.getTaskType(message.action.type);
    const queue = (taskType === 'code' || taskType === 'analysis') ? this.actionQueue : this.performanceQueue;
    
    // Add to appropriate queue with priority
    queue.add(
      () => this.processEvent(message),
      { priority: priorityScore }
    );
  }

  private calculatePriorityScore(message: QueueMessage): number {
    const baseScore = config.priorityWeights[message.priority];
    
    // Add time-based decay (older messages get slight boost)
    const ageMinutes = (Date.now() - new Date(message.timestamp).getTime()) / 60000;
    const ageBoost = Math.min(ageMinutes * 0.1, 10);
    
    return baseScore + ageBoost;
  }

  private async processEvent(message: QueueMessage): Promise<void> {
    const taskId = `task-${message.id}`;
    agentLogger.taskStarted(taskId, `Process ${message.action.type} from ${message.source}`);
    const startTime = Date.now();

    try {
      // Mark as processed
      this.processedMessages.add(message.id);

      // Determine task type and context
      const taskContext = this.analyzeEvent(message);

      // Spawn Claude instance to handle the task
      await this.spawnClaude(taskContext);

      // Clean up processed message
      await this.queueManager.deleteMessage(message.id);
      
      const duration = Date.now() - startTime;
      agentLogger.taskCompleted(taskId, duration);
      
      this.emit('event-processed', {
        success: true,
        messageId: message.id,
        duration
      });

    } catch (error) {
      logger.error(`Failed to process event ${message.id}:`, error);
      agentLogger.taskFailed(taskId, error as Error);
      
      this.emit('event-failed', {
        success: false,
        messageId: message.id,
        duration: Date.now() - startTime,
        error: error as Error
      });
    }
  }

  private analyzeEvent(message: QueueMessage): TaskContext {
    // Determine task type based on action and source
    let taskType = 'chat'; // default
    let requiredTools: string[] = [];

    switch (message.action.type) {
      case 'respond':
        if (message.source === 'twitch-chat') {
          taskType = 'chat';
          requiredTools = ['elevenlabs', 'rustybutter-avatar', 'semantic-memory'];
        } else if (message.source === 'discord') {
          taskType = 'chat';
          requiredTools = ['discord-tools', 'semantic-memory'];
        }
        break;
      
      case 'code_request':
        taskType = 'code';
        requiredTools = ['playwright-sse', 'semantic-memory'];
        break;
      
      case 'social_engagement':
        taskType = 'social';
        requiredTools = ['social-monitor', 'semantic-memory'];
        break;
      
      case 'memory_update':
        taskType = 'memory';
        requiredTools = ['semantic-memory'];
        break;
      
      case 'creative_task':
        taskType = 'creative';
        requiredTools = ['rustybutter-avatar', 'elevenlabs'];
        break;
    }

    // Override with configured tools if available
    if (config.taskToTools[taskType]) {
      requiredTools = config.taskToTools[taskType];
    }

    return {
      taskId: message.id,
      eventType: message.action.type,
      priority: message.priority,
      context: {
        source: message.source,
        action: message.action,
        context: message.context
      },
      requiredTools
    };
  }

  private async spawnClaude(context: TaskContext): Promise<void> {
    const claudeId = `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Select LLM provider based on task type
    const taskType = this.getTaskType(context.eventType);
    const providerName = config.taskToLLM[taskType] || 'anthropic';
    const provider = config.llmProviders.find(p => p.name === providerName);
    
    if (!provider) {
      throw new Error(`LLM provider ${providerName} not configured`);
    }

    logger.info(`Spawning Claude instance ${claudeId} with ${providerName} for ${context.eventType}`);

    // Build prompt based on context
    const prompt = this.buildPrompt(context);
    
    // Build MCP server config
    const mcpConfig = this.buildMCPConfig(context.requiredTools);

    // Spawn Claude process with MCP config as JSON string
    const claudeProcess = spawn('claude', [
      '--mcp-config', JSON.stringify(mcpConfig),
      '--print',  // Non-interactive mode
      '--verbose',  // Required for stream-json
      '--output-format', 'stream-json'  // Stream responses
      // Don't pass prompt as argument
    ], {
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: provider.baseUrl,
        ANTHROPIC_API_KEY: provider.apiKey,
        ANTHROPIC_MODEL: provider.model
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const instance: ClaudeInstance = {
      id: claudeId,
      process: claudeProcess,
      taskId: context.taskId,
      startTime: new Date(),
      provider: providerName
    };

    this.activeClaudes.set(claudeId, instance);

    // Handle Claude streaming JSON output
    let responseBuffer = '';
    claudeProcess.stdout?.on('data', (data) => {
      responseBuffer += data.toString();
      
      // Process complete JSON lines
      const lines = responseBuffer.split('\n');
      responseBuffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const event = JSON.parse(line);
            if (event.type === 'text') {
              logger.info(`[${claudeId}] Response: ${event.text}`);
            } else if (event.type === 'tool_use') {
              logger.info(`[${claudeId}] Using tool: ${event.name}`);
            }
          } catch (e) {
            // Not JSON, log as-is
            logger.info(`[${claudeId}] ${line}`);
          }
        }
      }
    });

    claudeProcess.stderr?.on('data', (data) => {
      logger.error(`[${claudeId}] ${data.toString().trim()}`);
    });

    claudeProcess.on('exit', (code) => {
      logger.info(`Claude instance ${claudeId} exited with code ${code}`);
      this.activeClaudes.delete(claudeId);
      
      this.emit('claude-exited', {
        id: claudeId,
        taskId: context.taskId,
        exitCode: code,
        duration: Date.now() - instance.startTime.getTime()
      });
    });

    // Send initial prompt
    claudeProcess.stdin?.write(prompt + '\n');
    claudeProcess.stdin?.end();
  }

  private getTaskType(eventType: string): string {
    // Map event types to task categories
    const mapping: Record<string, string> = {
      'respond': 'chat',
      'code_request': 'code',
      'social_engagement': 'social',
      'memory_update': 'memory',
      'creative_task': 'creative',
      'analysis': 'analysis'
    };
    
    return mapping[eventType] || 'chat';
  }

  private buildPrompt(context: TaskContext): string {
    const basePrompt = `You are an AI assistant handling a ${context.eventType} task.

Context:
- Source: ${context.context.source}
- Priority: ${context.priority}
- Event Type: ${context.eventType}

Task Details:
${JSON.stringify(context.context.action, null, 2)}

Available Tools:
${context.requiredTools.join(', ')}

Instructions:
1. Analyze the task requirements
2. Use the available tools to complete the task
3. Ensure quality and accuracy in your response
4. Follow up with any necessary actions

Please proceed with handling this task.`;

    // Add specific instructions based on event type
    switch (context.eventType) {
      case 'respond':
        return basePrompt + `\n\nThis is a response task. Engage naturally and helpfully with the user. Remember context from previous interactions using semantic memory.`;
      
      case 'code_request':
        return basePrompt + `\n\nThis is a coding task. Use Playwright for browser automation and testing. Store important code snippets in semantic memory.`;
      
      case 'social_engagement':
        return basePrompt + `\n\nThis is a social media task. Engage appropriately on the platform, maintaining the brand voice and personality.`;
      
      default:
        return basePrompt;
    }
  }

  private buildMCPConfig(tools: string[]): any {
    const mcpServers: Record<string, any> = {};

    // Add required tool servers
    for (const tool of tools) {
      switch (tool) {
        case 'playwright-sse':
          mcpServers['playwright'] = {
            type: 'sse',
            url: 'http://localhost:3456/mcp'
          };
          break;
        
        case 'discord-tools':
          mcpServers['discord'] = {
            type: 'sse',
            url: 'http://localhost:3457/mcp'
          };
          break;
        
        case 'semantic-memory':
          mcpServers['memory'] = {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-memory']
          };
          break;
        
        case 'elevenlabs':
          mcpServers['voice'] = {
            type: 'stdio',
            command: 'node',
            args: ['/home/codingbutter/GitHub/rusty-butter/packages/elevenlabs-streaming/packages/mcp-server/dist/index.js']
          };
          break;
        
        case 'rustybutter-avatar':
          mcpServers['avatar'] = {
            type: 'stdio',
            command: 'node',
            args: ['/home/codingbutter/GitHub/rusty-butter/packages/rustybutter-avatar/packages/mcp-server/dist/index.js']
          };
          break;
      }
    }

    return { mcpServers };
  }

  private async startProcessingLoop(): Promise<void> {
    while (this.isRunning) {
      // Clean up expired messages
      await this.queueManager.cleanExpiredMessages();
      
      // Check system health
      const actionQueueSize = this.actionQueue.size;
      const performanceQueueSize = this.performanceQueue.size;
      const actionPending = this.actionQueue.pending;
      const performancePending = this.performanceQueue.pending;
      const activeClaudes = this.activeClaudes.size;
      
      if (actionQueueSize > 30 || performanceQueueSize > 30) {
        logger.warn(`Queue backlog detected - Action: ${actionQueueSize}, Performance: ${performanceQueueSize}`);
      }

      if (activeClaudes >= config.maxConcurrentClaudes) {
        logger.warn(`Max Claude instances reached: ${activeClaudes}`);
      }

      // Emit status
      this.emit('status', {
        queues: {
          action: { size: actionQueueSize, pending: actionPending },
          performance: { size: performanceQueueSize, pending: performancePending }
        },
        mcpConnections: this.mcpConnections.size,
        processedTotal: this.processedMessages.size,
        activeClaudes,
        claudeInstances: Array.from(this.activeClaudes.values()).map(c => ({
          id: c.id,
          taskId: c.taskId,
          provider: c.provider,
          uptime: Date.now() - c.startTime.getTime()
        }))
      });

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down orchestrator...');
    
    this.isRunning = false;
    
    // Clear the queues
    this.actionQueue.clear();
    this.performanceQueue.clear();
    await Promise.all([
      this.actionQueue.onIdle(),
      this.performanceQueue.onIdle()
    ]);
    
    // Terminate active Claude instances
    for (const [id, instance] of this.activeClaudes) {
      logger.info(`Terminating Claude instance ${id}`);
      instance.process.kill('SIGTERM');
    }
    
    // Wait for all Claudes to exit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Force kill any remaining
    for (const [id, instance] of this.activeClaudes) {
      if (!instance.process.killed) {
        instance.process.kill('SIGKILL');
      }
    }
    
    // Disconnect from MCP servers
    await disconnectAll(this.mcpConnections);
    
    // Shutdown queue manager
    await this.queueManager.shutdown();
    
    logger.info('Orchestrator shutdown complete');
  }
}

// Main startup
async function main() {
  const orchestrator = new Orchestrator();

  // Set up event handlers
  orchestrator.on('event-processed', (result) => {
    logger.info(`Event processed: ${result.messageId} in ${result.duration}ms`);
  });

  orchestrator.on('event-failed', (result) => {
    logger.error(`Event failed: ${result.messageId}`, result.error);
  });

  orchestrator.on('claude-exited', (info) => {
    logger.info(`Claude ${info.id} completed task ${info.taskId} in ${info.duration}ms`);
  });

  orchestrator.on('status', (status) => {
    logger.debug('Orchestrator status:', status);
  });

  // Initialize
  await orchestrator.initialize();

  // Handle shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await orchestrator.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await orchestrator.shutdown();
    process.exit(0);
  });

  logger.info('Orchestrator is running');
}

// Error handling
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

// Start
main().catch((error) => {
  logger.error('Failed to start orchestrator:', error);
  process.exit(1);
});