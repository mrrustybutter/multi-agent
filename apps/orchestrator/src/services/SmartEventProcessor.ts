/**
 * Smart Event Processor
 * Simplified event processing with unified LLM routing
 */

import { EventEmitter } from 'events';
import PQueue from 'p-queue';
import { getLogger, getAgentLogger } from '@rusty-butter/logger';
import { 
  UnifiedLLMClient, 
  LLMRouter, 
  ToolCallHandler,
  ResponseParser,
  AudioProcessor,
  AudioConfig,
  getAvailableProviders,
  MemoryClient,
  initializeMemory,
  connectToMCPServer,
  MCPConnection,
  eventService
} from '@rusty-butter/shared';
import { Event } from '../types/index.js';
import { ClaudeManager } from './ClaudeManager.js';
import { PromptBuilder } from '../utils/PromptBuilder.js';
import { getConfig } from '../config/index.js';

const logger = getLogger('smart-event-processor');
const agentLogger = getAgentLogger('orchestrator');

export class SmartEventProcessor extends EventEmitter {
  private eventQueue: PQueue;
  private voiceQueue: PQueue;
  private eventHistory: Map<string, Event> = new Map();
  private claudeManager: ClaudeManager;
  private promptBuilder: PromptBuilder;
  
  // Unified LLM system
  private llmClient: UnifiedLLMClient;
  private llmRouter: LLMRouter;
  
  // Tools and utilities
  private toolCallHandler: ToolCallHandler | null = null;
  private audioProcessor: AudioProcessor;
  private memoryClient: MemoryClient | null = null;
  private mcpConnections: Map<string, MCPConnection> = new Map();
  
  private config: any;

  constructor(claudeManager: ClaudeManager) {
    super();
    this.claudeManager = claudeManager;
    this.promptBuilder = new PromptBuilder();
    this.audioProcessor = new AudioProcessor();
    
    // Initialize with defaults
    this.eventQueue = new PQueue({ concurrency: 5 });
    this.voiceQueue = new PQueue({ concurrency: 1 });
    
    // Initialize unified LLM system
    const availableProviders = getAvailableProviders().map(p => p.name);
    this.llmClient = new UnifiedLLMClient(availableProviders);
    this.llmRouter = new LLMRouter();
    
    logger.info(`🤖 Initialized with providers: ${availableProviders.join(', ')}`);
  }

  async initialize(): Promise<void> {
    logger.info('🚀 Initializing Smart Event Processor...');
    
    // Load configuration
    this.config = await getConfig();
    
    // Update queues with config
    this.eventQueue = new PQueue({ 
      concurrency: this.config.maxConcurrency || 5
    });
    
    this.voiceQueue = new PQueue({ 
      concurrency: this.config.voiceQueueConcurrency || 1
    });

    // Initialize components in parallel
    await Promise.all([
      this.initializeMemory(),
      this.initializeMCPConnections(),
      this.testLLMProviders()
    ]);
    
    // Initialize tool handler with available clients
    this.initializeToolHandler();
    
    logger.info('✅ Smart Event Processor initialized successfully');
  }

  /**
   * Queue an event for processing
   */
  async queueEvent(event: Event): Promise<void> {
    this.eventHistory.set(event.id, event);
    
    const routing = this.llmRouter.routeEvent(event);
    const isVoiceEvent = routing.useCase === 'chat' || routing.useCase === 'tools' || routing.useCase === 'social';
    
    logger.info(`📋 Queuing event ${event.id} (${routing.provider}/${routing.useCase})`);
    
    if (isVoiceEvent) {
      await this.voiceQueue.add(() => this.processEvent(event));
    } else {
      await this.eventQueue.add(() => this.processEvent(event));
    }
  }

  /**
   * Process an individual event
   */
  private async processEvent(event: Event): Promise<void> {
    const startTime = Date.now();
    const taskId = `task-${event.id}`;
    agentLogger.taskStarted(taskId, `Processing ${event.type} from ${event.source}`);
    
    let mainInstanceId: string | undefined;

    try {
      // Update event status
      await eventService.updateEvent(event.id, {
        status: 'processing',
        metadata: { startTime: new Date() }
      });

      // Route the event to the appropriate processor
      const routing = this.llmRouter.routeEvent(event);
      let response: string | undefined;
      
      if (routing.useCase === 'coding') {
        // Use Claude Code for coding tasks
        response = await this.processCodingEvent(event);
      } else {
        // Use unified LLM system for other tasks
        response = await this.processLLMEvent(event, routing.provider);
      }
      
      const duration = Date.now() - startTime;
      agentLogger.taskCompleted(taskId, duration);
      
      // Update event status
      await eventService.updateEvent(event.id, {
        status: 'completed',
        response,
        duration,
        completedAt: new Date(),
        metadata: {
          provider: routing.provider,
          useCase: routing.useCase,
          claudeInstanceId: mainInstanceId
        }
      });
      
      this.emit('event-processed', { eventId: event.id, duration });

    } catch (error) {
      logger.error(`❌ Failed to process event ${event.id}:`, error);
      agentLogger.taskFailed(taskId, error as Error);
      
      await eventService.updateEvent(event.id, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.emit('event-failed', { eventId: event.id, error: error as Error });
    }
  }

  /**
   * Process coding events with Claude Code
   */
  private async processCodingEvent(event: Event): Promise<string> {
    logger.info(`👨‍💻 Processing coding event with Claude Code`);
    
    const claudeConfig = {
      role: 'event-processor',
      prompt: this.promptBuilder.buildMainClaudePrompt(event),
      mcpServers: this.determineRequiredMCPServers(event),
      detached: false
    };

    const result = await this.claudeManager.spawnClaude(claudeConfig, event.id);
    if (result.instanceId) {
      await this.claudeManager.waitForClaudeCompletion(result.instanceId);
    }
    
    return result.response || 'Claude Code processing completed';
  }

  /**
   * Process events with unified LLM system
   */
  private async processLLMEvent(event: Event, provider: string): Promise<string> {
    logger.info(`🤖 Processing event with ${provider}`);
    
    // Build messages
    const messages = [
      {
        role: 'system' as const,
        content: this.promptBuilder.buildLLMSystemPrompt(event)
      },
      {
        role: 'user' as const,
        content: this.buildEventMessage(event)
      }
    ];

    // Get semantic context
    const context = await this.getSemanticContext(event);
    if (context) {
      messages[0].content += `\n\nRelevant context from memory:\n${context}`;
    }

    // Determine if we need tools
    const routing = this.llmRouter.routeEvent(event);
    const needsTools = routing.useCase === 'tools' || routing.useCase === 'chat' || routing.useCase === 'social';
    const tools = needsTools && this.toolCallHandler ? this.toolCallHandler.getVoiceResponseTools() : undefined;

    // Generate response
    const response = await this.llmClient.generateResponse(provider as any, messages, {
      tools,
      temperature: 0.7
    });

    let finalResponse = response.content;

    // Handle tool calls
    if (response.toolCalls && response.toolCalls.length > 0 && this.toolCallHandler) {
      logger.info(`🔧 Executing ${response.toolCalls.length} tool calls`);
      
      const toolResults = await this.toolCallHandler.executeToolCalls(response.toolCalls);
      
      // Check for speech generation
      const speechGenerated = this.checkForSpeechGeneration(toolResults);
      if (!speechGenerated) {
        await this.generateFallbackSpeech(response.content);
      }
    } else if (needsTools && response.content) {
      // Generate speech for chat responses that didn't use tools
      await this.generateFallbackSpeech(response.content);
    }

    // Store interaction in memory
    await this.storeInteraction(event, finalResponse);

    return finalResponse;
  }

  /**
   * Generate fallback speech when no speech tool was called
   */
  private async generateFallbackSpeech(content: string): Promise<void> {
    try {
      const speechText = ResponseParser.cleanForSpeech(content);
      if (speechText && speechText.length > 5) {
        const audioConfig: AudioConfig = {
          voice_id: process.env.ELEVEN_VOICE_ID || 'Au8OOcCmvsCaQpmULvvQ'
        };
        
        const result = await this.audioProcessor.generateAudio(speechText, audioConfig);
        logger.info(`🔊 Fallback speech generated: ${result.message}`);
      }
    } catch (error) {
      logger.warn('⚠️ Failed to generate fallback speech:', error);
    }
  }

  /**
   * Check if speech was generated via tool calls
   */
  private checkForSpeechGeneration(toolResults: Map<string, any>): boolean {
    for (const [id, result] of toolResults) {
      try {
        const content = typeof result.content === 'string' ? JSON.parse(result.content) : result.content;
        if (content.audio_generated || content.success) {
          return true;
        }
      } catch {
        // Ignore parsing errors
      }
    }
    return false;
  }

  private async initializeMemory(): Promise<void> {
    try {
      logger.info('🧠 Initializing semantic memory...');
      this.memoryClient = await initializeMemory();
      logger.info('✅ Semantic memory initialized');
    } catch (error) {
      logger.warn('⚠️ Semantic memory initialization failed:', error);
    }
  }

  private async initializeMCPConnections(): Promise<void> {
    // This would connect to MCP servers - simplified for now
    logger.info('🔌 MCP connections ready');
  }

  private async testLLMProviders(): Promise<void> {
    logger.info('🧪 Testing LLM provider connections...');
    const providers = this.llmClient.getAvailableProviders();
    
    for (const provider of providers) {
      const working = await this.llmClient.testProvider(provider);
      if (!working) {
        logger.warn(`⚠️ Provider ${provider} failed connection test`);
      }
    }
  }

  private initializeToolHandler(): void {
    if (this.memoryClient) {
      this.toolCallHandler = new ToolCallHandler(undefined, this.memoryClient);
      logger.info('🔧 Tool call handler initialized with memory client');
    } else {
      logger.warn('⚠️ Tool call handler not initialized (no memory client)');
    }
  }

  private buildEventMessage(event: Event): string {
    let message = `Event: ${event.type} from ${event.source}\n`;
    message += `Priority: ${event.priority}\n`;
    message += `Timestamp: ${event.timestamp.toISOString()}\n\n`;
    
    if (event.data?.message) {
      message += `Message: ${event.data.message}\n`;
    }
    if (event.data?.user || event.data?.username) {
      message += `From: ${event.data.user || event.data.username}\n`;
    }
    if (event.context) {
      message += `\nContext: ${JSON.stringify(event.context, null, 2)}`;
    }
    
    return message;
  }

  private async getSemanticContext(event: Event): Promise<string | undefined> {
    if (!this.memoryClient) return undefined;

    try {
      const query = event.data?.message || `${event.source} ${event.type}`;
      const memories = await this.memoryClient.recall('general', query, 3);
      
      if (memories.length > 0) {
        logger.info(`🧠 Retrieved ${memories.length} relevant memories`);
        return memories.map((m: any) => m.content || JSON.stringify(m)).join('\n\n');
      }
    } catch (error) {
      logger.debug('Memory recall failed:', error);
    }
    
    return undefined;
  }

  private async storeInteraction(event: Event, response: string): Promise<void> {
    if (!this.memoryClient) return;

    try {
      if (event.data?.message) {
        await this.memoryClient.embed(
          event.data.message,
          'user-interactions',
          {
            source: event.source,
            user: event.data.user || event.data.username,
            timestamp: event.timestamp.toISOString()
          }
        );
      }

      await this.memoryClient.embed(
        response,
        'user-interactions',
        {
          source: event.source,
          user: 'RustyButter',
          timestamp: new Date().toISOString()
        }
      );

      logger.debug('🧠 Interaction stored in memory');
    } catch (error) {
      logger.debug('Failed to store interaction:', error);
    }
  }

  private determineRequiredMCPServers(event: Event): string[] {
    const servers: string[] = [];
    
    if (event.type === 'chat_message' || event.data?.message) {
      servers.push('elevenlabs', 'avatar');
    }
    
    return servers;
  }

  getStatus() {
    return {
      queueSize: this.eventQueue.size,
      queuePending: this.eventQueue.pending,
      voiceQueueSize: this.voiceQueue.size,
      voiceQueuePending: this.voiceQueue.pending,
      eventHistory: this.eventHistory.size,
      availableProviders: this.llmClient.getAvailableProviders()
    };
  }
}