import { EventEmitter } from 'events';
import PQueue from 'p-queue';
import { getLogger, getAgentLogger } from '@rusty-butter/logger';
import { Event, QueuedEvent, ClaudeConfig, LLMProvider } from '../types';
import { getConfig, getLLMRouting } from '../config';
import { ClaudeManager } from './ClaudeManager';
import { OrchestratorBrain, RoutingDecision } from './OrchestratorBrain';
import { PromptBuilder } from '../utils/PromptBuilder';
import { 
  LLMService, 
  LLMConfig, 
  LLMMessage, 
  AudioConfig, 
  initializeMemory, 
  MemoryClient, 
  eventService,
  ToolCallHandler,
  ResponseParser,
  connectToMCPServer,
  MCPConnection
} from '@rusty-butter/shared';

const logger = getLogger('event-processor');
const agentLogger = getAgentLogger('orchestrator');

export class EventProcessor extends EventEmitter {
  private eventQueue: PQueue;
  private voiceQueue: PQueue;
  private eventHistory: Map<string, Event> = new Map();
  private retryQueue: Map<string, QueuedEvent> = new Map();
  private claudeManager: ClaudeManager;
  private orchestratorBrain: OrchestratorBrain;
  private promptBuilder: PromptBuilder;
  private llmServices: Map<LLMProvider, LLMService> = new Map();
  private memoryClient: MemoryClient | null = null;
  private toolCallHandler: ToolCallHandler | null = null;
  private mcpConnections: Map<string, MCPConnection> = new Map();
  private config: any;
  private llmRouting: any;
  private activeLLMOperations: Map<string, {
    eventId: string;
    provider: LLMProvider;
    startTime: Date;
    type: string;
  }> = new Map();

  constructor(claudeManager: ClaudeManager) {
    super();
    this.claudeManager = claudeManager;
    this.promptBuilder = new PromptBuilder();
    this.orchestratorBrain = new OrchestratorBrain(claudeManager, null);
    
    // Initialize with defaults, will be updated in initialize()
    this.eventQueue = new PQueue({ concurrency: 5 });
    this.voiceQueue = new PQueue({ concurrency: 1 });
  }

  async initialize() {
    // Load configuration
    this.config = await getConfig();
    this.llmRouting = await getLLMRouting();
    
    // Update queues with config
    this.eventQueue = new PQueue({ 
      concurrency: this.config.maxConcurrency 
    });
    
    this.voiceQueue = new PQueue({ 
      concurrency: this.config.voiceQueueConcurrency 
    });

    // Initialize LLM services
    this.initializeLLMServices();
    
    // Initialize semantic memory and tool handler
    await this.initializeMemory();
    
    // Initialize orchestrator brain with memory client
    this.orchestratorBrain = new OrchestratorBrain(this.claudeManager, this.memoryClient);
    await this.orchestratorBrain.initialize();
    
    // Initialize MCP connections for tools
    await this.initializeMCPConnections();
    
    // Initialize tool handler with ElevenLabs and memory clients
    const elevenLabsConnection = this.mcpConnections.get('elevenlabs');
    
    if (elevenLabsConnection || this.memoryClient) {
      this.toolCallHandler = new ToolCallHandler(
        elevenLabsConnection?.client, 
        this.memoryClient || undefined
      );
      logger.info(`🔧 Tool call handler initialized with: ${[
        elevenLabsConnection ? 'ElevenLabs MCP' : null,
        this.memoryClient ? 'Memory client' : null
      ].filter(Boolean).join(', ')}`);
    } else {
      this.toolCallHandler = new ToolCallHandler();
      logger.info('🔧 Tool call handler initialized (no MCP clients available)');
    }

    // Set up retry mechanism
    setInterval(() => this.processRetryQueue(), this.config.retryDelay);
    
    // Set up cleanup for hanging LLM operations
    setInterval(() => this.cleanupHangingOperations(), 60000); // Every minute
  }

  async queueEvent(event: Event): Promise<void> {
    // Store event in history
    this.eventHistory.set(event.id, event);
    
    // Event has already been logged to MongoDB in the route handler
    // Just queue it for processing
    
    // Determine if this is a voice-priority event
    const isVoiceEvent = this.isVoiceEvent(event);
    
    if (isVoiceEvent) {
      logger.info(`Voice queue processing event ${event.id}`);
      await this.voiceQueue.add(() => this.processEvent(event));
    } else {
      logger.info(`Standard queue processing event ${event.id}`);
      await this.eventQueue.add(() => this.processEvent(event));
    }
  }

  private async processEvent(event: Event): Promise<void> {
    const startTime = Date.now();
    const taskId = `task-${event.id}`;
    agentLogger.taskStarted(taskId, `Processing ${event.type} from ${event.source}`);
    
    let mainInstanceId: string | undefined;

    try {
      // Update event status to processing
      await eventService.updateEvent(event.id, {
        status: 'processing',
        metadata: { startTime: new Date() }
      });
      
      // Get routing decision from orchestrator brain
      logger.info(`🧠 Getting routing decision for event ${event.id}`);
      const routingDecision = await this.orchestratorBrain.processEvent(event);
      
      logger.info(`📋 Routing: ${routingDecision.provider}/${routingDecision.useCase} - ${routingDecision.reason}`);
      
      let response: string | undefined;
      
      if (routingDecision.provider === 'claude' && routingDecision.useCase === 'coding') {
        // Use Claude Code for coding tasks
        const claudeConfig: ClaudeConfig = {
          role: 'event-processor',
          prompt: this.promptBuilder.buildMainClaudePrompt(event),
          mcpServers: ['semantic-memory', ...routingDecision.requiresTools],
          detached: false
        };
        
        const result = await this.claudeManager.spawnClaude(claudeConfig, event.id);
        mainInstanceId = result.instanceId;
        response = result.response;
        await this.claudeManager.waitForClaudeCompletion(mainInstanceId);
      } else {
        // Map routing decision provider to LLMProvider type
        const providerMap: Record<string, LLMProvider> = {
          'openai': 'openai',
          'grok': 'grok',
          'gemini': 'gemini',
          'groq': 'groq'
        };
        const llmProvider = providerMap[routingDecision.provider] || 'openai';
        
        // Use LLM service for chat/audio tasks
        response = await this.processWithLLMService(event, llmProvider);
      }
      
      // Parse and embed action summary to semantic memory
      if (response) {
        await this.parseAndEmbedActionSummary(event, response, routingDecision.provider);
      }

      const duration = Date.now() - startTime;
      agentLogger.taskCompleted(taskId, duration);
      
      // Update event status to completed with response
      await eventService.updateEvent(event.id, {
        status: 'completed',
        response,
        duration,
        completedAt: new Date(),
        metadata: {
          provider: routingDecision.provider,
          useCase: routingDecision.useCase,
          claudeInstanceId: mainInstanceId,
          completedAt: new Date()
        }
      });
      
      this.emit('event-processed', {
        eventId: event.id,
        mainInstanceId,
        duration
      });

    } catch (error) {
      logger.error(`Failed to process event ${event.id}:`, error);
      agentLogger.taskFailed(taskId, error as Error);
      
      // Update event status to error
      await eventService.updateEvent(event.id, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          errorStack: error instanceof Error ? error.stack : undefined,
          failedAt: new Date()
        }
      });
      
      // Add to retry queue if retries remain
      const queuedEvent = this.retryQueue.get(event.id) || {
        event,
        retries: 0,
        maxRetries: this.config.maxRetries
      };
      
      if (queuedEvent.retries < queuedEvent.maxRetries) {
        queuedEvent.retries++;
        this.retryQueue.set(event.id, queuedEvent);
        logger.info(`Event ${event.id} queued for retry (attempt ${queuedEvent.retries}/${queuedEvent.maxRetries})`);
      }
      
      this.emit('event-failed', {
        eventId: event.id,
        error: error as Error,
        duration: Date.now() - startTime
      });
    }
  }

  private isVoiceEvent(event: Event): boolean {
    // Check if this is a coding-related message (should NOT generate voice)
    const message = event.data?.message || event.data?.text || '';
    const lowerMessage = message.toLowerCase();
    
    // Don't generate voice for coding questions
    const codingKeywords = ['code', 'implement', 'function', 'debug', 'error', 'bug'];
    if (codingKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return false;
    }
    
    // Voice events are chat messages that aren't coding-related
    return (
      event.type === 'speak' ||
      (event.type === 'chat_message' && this.determineLLMProvider(event) !== 'anthropic') ||
      event.data?.requiresVoice === true ||
      (event.priority === 'critical' && event.data?.requiresVoice !== false)
    );
  }

  private initializeLLMServices(): void {
    logger.info('🤖 Initializing LLM services...');
    
    const providers: { provider: LLMProvider; apiKeyEnv: string; baseUrl?: string; model?: string }[] = [
      { provider: 'openai', apiKeyEnv: 'OPENAI_API_KEY' },
      { provider: 'grok', apiKeyEnv: 'GROK_API_KEY', baseUrl: 'https://api.x.ai/v1' },
      { provider: 'gemini', apiKeyEnv: 'GEMINI_API_KEY' },
      { provider: 'groq', apiKeyEnv: 'GROQ_API_KEY', baseUrl: 'https://api.groq.com/openai/v1' },
      { provider: 'cerebras', apiKeyEnv: 'CEREBRAS_API_KEY', baseUrl: 'https://api.cerebras.ai/v1' }
    ];
    
    for (const { provider, apiKeyEnv, baseUrl, model } of providers) {
      const apiKey = process.env[apiKeyEnv];
      if (apiKey) {
        try {
          const config: LLMConfig = { provider, apiKey, baseUrl, model };
          this.llmServices.set(provider, new LLMService(config));
          logger.info(`✅ ${provider} service initialized`);
        } catch (error) {
          logger.warn(`⚠️  Failed to initialize ${provider} service:`, error);
        }
      } else {
        logger.warn(`⚠️  ${apiKeyEnv} not found, ${provider} service disabled`);
      }
    }
  }
  
  private async initializeMemory(): Promise<void> {
    try {
      logger.info('🧠 Initializing semantic memory...');
      this.memoryClient = await initializeMemory();
      logger.info('✅ Semantic memory initialized successfully');
    } catch (error) {
      logger.warn('⚠️  Semantic memory initialization failed, continuing without:', error);
    }
  }
  
  private async initializeMCPConnections(): Promise<void> {
    try {
      logger.info('🔌 Initializing MCP connections for tools...');
      
      // Check if we can use SSE connections to MCP servers
      const sseConnections = await this.trySSEConnections();
      
      if (sseConnections.elevenlabs) {
        this.mcpConnections.set('elevenlabs', sseConnections.elevenlabs);
        logger.info('✅ Connected to ElevenLabs MCP server via SSE');
      } else {
        // Fallback to stdio connection for ElevenLabs
        try {
          const elevenLabsConnection = await connectToMCPServer({
            name: 'elevenlabs',
            command: 'node',
            args: ['/home/codingbutter/GitHub/multi-agent/apps/tools/elevenlabs/dist/index.js'],
            env: {
              ELEVEN_API_KEY: process.env.ELEVEN_API_KEY || ''
            }
          });
          
          this.mcpConnections.set('elevenlabs', elevenLabsConnection);
          logger.info('✅ Connected to ElevenLabs MCP server via stdio');
        } catch (error) {
          logger.warn('⚠️  Failed to connect to ElevenLabs MCP via stdio:', error);
        }
      }
      
      if (sseConnections.avatar) {
        this.mcpConnections.set('avatar-server', sseConnections.avatar);
        logger.info('✅ Connected to Avatar MCP server via SSE');
      } else {
        // Fallback to stdio connection for Avatar
        try {
          const avatarConnection = await connectToMCPServer({
            name: 'avatar-server',
            command: 'node',
            args: ['/home/codingbutter/GitHub/multi-agent/apps/tools/avatar-server/dist/index.js']
          });
          
          this.mcpConnections.set('avatar-server', avatarConnection);
          logger.info('✅ Connected to Avatar MCP server via stdio');
        } catch (error) {
          logger.warn('⚠️  Failed to connect to Avatar MCP via stdio:', error);
        }
      }
      
      // List tools from connected servers
      for (const [name, connection] of this.mcpConnections) {
        try {
          const tools = await connection.client.listTools();
          logger.info(`📋 Available ${name} tools: ${tools.tools.map((t: any) => t.name).join(', ')}`);
        } catch (error) {
          logger.debug(`Could not list ${name} tools:`, error);
        }
      }
      
    } catch (error) {
      logger.error('❌ Failed to initialize MCP connections:', error);
    }
  }

  private async trySSEConnections(): Promise<{elevenlabs?: MCPConnection, avatar?: MCPConnection}> {
    const connections: {elevenlabs?: MCPConnection, avatar?: MCPConnection} = {};
    
    // Try ElevenLabs SSE connection
    try {
      logger.info('🔌 Attempting to connect to ElevenLabs SSE at http://localhost:3454/sse');
      
      // For now, we'll skip SSE connections and use stdio since we need to implement SSE support
      // This is a placeholder for future SSE MCP implementation
      logger.info('📝 SSE connections not yet implemented, will use stdio fallback');
      
    } catch (error) {
      logger.debug('SSE connection to ElevenLabs failed:', error);
    }
    
    return connections;
  }
  
  private async processWithLLMService(event: Event, provider: LLMProvider): Promise<string | undefined> {
    const llmService = this.llmServices.get(provider);
    if (!llmService) {
      logger.error(`❌ LLM service not available for provider: ${provider}`);
      throw new Error(`LLM service not available for provider: ${provider}`);
    }
    
    logger.info(`🎯 Processing event ${event.id} with ${provider}`);
    
    // Track active LLM operation
    const operationId = `llm-${event.id}`;
    this.activeLLMOperations.set(operationId, {
      eventId: event.id,
      provider,
      startTime: new Date(),
      type: event.type
    });
    
    // Build messages for LLM
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: this.promptBuilder.buildLLMSystemPrompt(event)
      },
      {
        role: 'user', 
        content: this.buildEventMessage(event)
      }
    ];
    
    // Check if this is an audio event
    const isAudioEvent = this.isVoiceEvent(event);
    
    try {
      // Get context from semantic memory
      const context = await this.getSemanticContext(event);
      
      let responseContent: string;
      let speechText: string | undefined;
      
      if (isAudioEvent && provider === 'openai' && this.toolCallHandler) {
        // Use OpenAI with function calling for voice responses
        const tools = this.toolCallHandler.getVoiceResponseTools();
        
        // Generate response with tools
        const response = await llmService.generateResponse(messages, context, tools);
        
        // Parse response to extract speech and handle tool calls
        const parsed = ResponseParser.parseResponse(response.content, response.toolCalls);
        
        // Execute tool calls if present
        if (response.toolCalls && response.toolCalls.length > 0) {
          logger.info(`🔧 Executing ${response.toolCalls.length} tool calls`);
          
          const toolResults = await this.toolCallHandler.executeToolCalls(response.toolCalls);
          
          // Check if speech was generated via tools
          for (const [id, result] of toolResults) {
            const resultContent = JSON.parse(result.content);
            if (resultContent.audio_generated) {
              logger.info('🎵 Audio generated via tool call');
            }
          }
        }
        
        // Use parsed speech text or fall back to cleaned response
        speechText = parsed.speechText || ResponseParser.cleanForSpeech(response.content);
        responseContent = response.content || '';
        
        // If no response content but we have tool calls, build a response
        if (!responseContent && response.toolCalls && response.toolCalls.length > 0) {
          // Build a summary of what was done via tool calls
          const toolSummary = response.toolCalls.map((tc: any) => {
            if (tc.function.name === 'generate_speech') {
              const args = JSON.parse(tc.function.arguments);
              return args.text || 'Generated speech response';
            } else if (tc.function.name === 'set_avatar_expression') {
              return 'Set avatar expression';
            }
            return `Called ${tc.function.name}`;
          }).join('. ');
          responseContent = toolSummary;
        }
        
        logger.info(`🎵 Speech analysis: speechText="${speechText?.substring(0, 50) || 'none'}...", responseContent="${responseContent.substring(0, 100) || 'none'}..."`);
        
        // Check if speech was generated via tool calls
        const hasSpeechToolCall = response.toolCalls?.some((tc: any) => tc.function.name === 'generate_speech');
        logger.info(`🔧 Tool call analysis: toolCalls=${response.toolCalls?.length || 0}, hasSpeechToolCall=${hasSpeechToolCall}`);
        
        // If no audio was generated via tools, generate it directly
        if (speechText && !hasSpeechToolCall) {
          logger.info(`🔊 Generating fallback speech for: "${speechText.substring(0, 50)}..."`);
          const audioConfig: AudioConfig = {
            voice_id: process.env.ELEVEN_VOICE_ID || 'Au8OOcCmvsCaQpmULvvQ'
          };
          const audio = await llmService.generateAudio(speechText, audioConfig);
          logger.info(`🔊 Fallback audio generated: ${audio.message}`);
        } else if (!speechText) {
          logger.warn(`⚠️ No speechText extracted from response`);
        } else if (hasSpeechToolCall) {
          logger.info(`ℹ️ Speech generation handled via tool call, skipping fallback`);
        }
        
        // Store the interaction and action summary if we have content
        if (responseContent) {
          await this.storeInteraction(event, responseContent);
          if (parsed.actionSummary) {
            await this.embedToMemory(event, responseContent, provider, parsed.actionSummary);
          }
        } else {
          logger.warn('⚠️ No response content to store in memory');
        }
        
      } else if (isAudioEvent) {
        // Fallback to original audio generation for non-OpenAI providers
        const audioConfig: AudioConfig = {
          voice_id: process.env.ELEVEN_VOICE_ID || 'Au8OOcCmvsCaQpmULvvQ'
        };
        
        const { response, audio } = await llmService.generateAudioResponse(messages, audioConfig, context);
        responseContent = response.content;
        
        logger.info(`🎵 Audio response generated: ${response.content.substring(0, 100)}...`);
        logger.info(`🔊 Audio status: ${audio.message}`);
        
        await this.storeInteraction(event, response.content);
      } else {
        // Generate text response with context
        const response = await llmService.generateResponse(messages, context);
        responseContent = response.content;
        logger.info(`📝 Text response generated: ${response.content.substring(0, 100)}...`);
        
        await this.storeInteraction(event, response.content);
      }
      
      // Remove from active operations on success
      this.activeLLMOperations.delete(operationId);
      
      return responseContent;
      
    } catch (error) {
      // Remove from active operations on error
      this.activeLLMOperations.delete(operationId);
      logger.error(`❌ Failed to process event with ${provider}:`, error);
      throw error;
    }
  }
  
  private buildEventMessage(event: Event): string {
    let message = `Event: ${event.type} from ${event.source}\n`;
    message += `Priority: ${event.priority}\n`;
    message += `Timestamp: ${event.timestamp.toISOString()}\n\n`;
    
    if (event.data) {
      if (event.data.message) {
        message += `Message: ${event.data.message}\n`;
      }
      if (event.data.username) {
        message += `From: ${event.data.username}\n`;
      }
      if (event.data.channel) {
        message += `Channel: ${event.data.channel}\n`;
      }
    }
    
    if (event.context) {
      message += `\nContext: ${JSON.stringify(event.context, null, 2)}`;
    }
    
    return message;
  }
  
  private async getSemanticContext(event: Event): Promise<string | undefined> {
    if (!this.memoryClient) {
      return undefined;
    }
    
    try {
      // Determine the appropriate memory bank
      const memoryBank = this.determineMemoryBank(event);
      
      // Build specific query based on event content
      let query = this.buildMemoryQuery(event);
      
      // Query multiple memory banks for comprehensive context
      const memoryBanks = [memoryBank];
      
      // Always include user-interactions for personalization
      if (memoryBank !== 'user-interactions' && event.data?.user) {
        memoryBanks.push('user-interactions');
      }
      
      // Include project context for code-related queries
      if (memoryBank === 'code-knowledge') {
        memoryBanks.push('project-context');
      }
      
      let allMemories: any[] = [];
      
      // Map memory bank to valid category for semantic-memory server
      const getMemoryCategory = (bank: string): string => {
        switch (bank) {
          case 'code-knowledge':
            return 'code';
          case 'user-interactions':
          case 'streaming-context':
            return 'chat';
          case 'project-context':
            return 'document';
          case 'general-knowledge':
          default:
            return 'conversation';
        }
      };
      
      // Query each memory bank
      for (const bank of memoryBanks) {
        const category = getMemoryCategory(bank);
        const memories = await this.memoryClient.recall(category, query, 2);
        allMemories = allMemories.concat(memories.map((m: any) => ({ ...m, bank })));
      }
      
      if (allMemories.length > 0) {
        const context = allMemories.map((m: any) => {
          const bankLabel = m.bank ? `[${m.bank}]` : '';
          if (m.metadata) {
            return `${bankLabel} Previous from ${m.metadata.source} (${new Date(m.metadata.timestamp).toLocaleDateString()}): ${m.content}`;
          }
          return `${bankLabel} ${m.content}`;
        }).join('\n\n');
        
        logger.info(`🧠 Retrieved ${allMemories.length} relevant memories from banks: ${memoryBanks.join(', ')}`);
        return context;
      }
    } catch (error) {
      logger.warn('⚠️  Failed to retrieve semantic context:', error);
    }
    
    return undefined;
  }
  
  private async parseAndEmbedActionSummary(event: Event, response: string, provider: string): Promise<void> {
    try {
      // Extract action summary from response
      const summaryMatch = response.match(/---ACTION SUMMARY---([\s\S]*?)---END SUMMARY---/);
      
      if (!summaryMatch) {
        logger.warn(`No action summary found in response for event ${event.id}`);
        // Still embed basic information
        await this.embedToMemory(event, response, provider, null);
        return;
      }
      
      const summaryText = summaryMatch[1];
      
      // Parse the summary sections
      const actionsTaken = this.extractSection(summaryText, 'Actions Taken');
      const keyInfo = this.extractSection(summaryText, 'Key Information');
      const responseType = this.extractValue(summaryText, 'Response Type');
      const complexity = this.extractValue(summaryText, 'Complexity');
      
      // Create structured summary
      const actionSummary = {
        eventId: event.id,
        eventType: event.type,
        source: event.source,
        provider,
        actionsTaken,
        keyInformation: keyInfo,
        responseType: responseType || 'unknown',
        complexity: complexity || 'moderate',
        timestamp: new Date(),
        fullResponse: response
      };
      
      // Embed to semantic memory with appropriate bank
      await this.embedToMemory(event, response, provider, actionSummary);
      
      logger.info(`✅ Action summary embedded to semantic memory for event ${event.id}`);
      
    } catch (error) {
      logger.error(`Failed to parse action summary for event ${event.id}:`, error);
      // Still try to embed basic information
      await this.embedToMemory(event, response, provider, null);
    }
  }
  
  private extractSection(text: string, sectionName: string): string[] {
    const regex = new RegExp(`\\*\\*${sectionName}:\\*\\*([\\s\\S]*?)(?=\\*\\*|$)`, 'i');
    const match = text.match(regex);
    if (!match) return [];
    
    return match[1]
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-'))
      .map(line => line.substring(1).trim());
  }
  
  private extractValue(text: string, fieldName: string): string | null {
    const regex = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*\\[?([^\\]\\n]+)\\]?`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }
  
  private async embedToMemory(event: Event, response: string, provider: string, actionSummary: any): Promise<void> {
    if (!this.memoryClient) {
      logger.warn('Memory client not initialized, skipping embedding');
      return;
    }
    
    try {
      // Determine memory bank based on response type
      let bank = 'general-knowledge';
      if (actionSummary?.responseType) {
        switch (actionSummary.responseType) {
          case 'code_implementation':
          case 'bug_fix':
          case 'file_creation':
            bank = 'code-knowledge';
            break;
          case 'chat_response':
            bank = event.source === 'twitch' || event.source === 'discord' 
              ? 'streaming-context' 
              : 'user-interactions';
            break;
          case 'configuration':
          case 'analysis':
            bank = 'project-context';
            break;
        }
      }
      
      // Create memory content
      const memoryContent = actionSummary ? 
        `Event: ${event.type} from ${event.source}
Provider: ${provider}
Actions: ${actionSummary.actionsTaken.join(', ')}
Key Info: ${actionSummary.keyInformation.join(', ')}
Response Type: ${actionSummary.responseType}
Complexity: ${actionSummary.complexity}
Full Response: ${response.substring(0, 1000)}...` :
        `Event: ${event.type} from ${event.source}
Provider: ${provider}
Response: ${response.substring(0, 1000)}...`;
      
      // Map memory bank to valid type for semantic-memory server
      const getMemoryType = (bank: string): string => {
        switch (bank) {
          case 'code-knowledge':
            return 'code';
          case 'user-interactions':
          case 'streaming-context':
            return 'chat';
          case 'project-context':
            return 'document';
          case 'general-knowledge':
          default:
            return 'conversation';
        }
      };
      
      const memoryType = getMemoryType(bank);
      
      // Store in semantic memory
      await this.memoryClient.embed(
        memoryContent,
        memoryType,
        {
          eventId: event.id,
          eventType: event.type,
          source: event.source,
          provider,
          responseType: actionSummary?.responseType,
          complexity: actionSummary?.complexity,
          timestamp: new Date().toISOString()
        }
      );
      
      const memoryId = `mem-${event.id}-${Date.now()}`;
      
      // Update event with memory ID
      await eventService.updateEvent(event.id, {
        memoryIds: [memoryId]
      });
      
      logger.info(`📝 Stored action summary in ${bank} bank with ID: ${memoryId}`);
      
    } catch (error) {
      logger.error('Failed to embed to semantic memory:', error);
    }
  }
  
  private async storeInteraction(event: Event, response: string): Promise<void> {
    if (!this.memoryClient) {
      return;
    }
    
    try {
      const memoryBank = this.determineMemoryBank(event);
      const isCodeRelated = this.isCodeRelated(event);
      
      // Map memory bank to valid type for semantic-memory server
      const getMemoryType = (bank: string): string => {
        switch (bank) {
          case 'code-knowledge':
            return 'code';
          case 'user-interactions':
          case 'streaming-context':
            return 'chat';
          case 'project-context':
            return 'document';
          case 'general-knowledge':
          default:
            return 'conversation';
        }
      };
      
      const memoryType = getMemoryType(memoryBank);
      
      // Store the user's message if it exists
      if (event.data?.message) {
        await this.memoryClient.embed(
          event.data.message,
          memoryType,
          {
            source: event.source,
            eventType: event.type,
            username: event.data.username || event.data.user,
            channel: event.data.channel,
            timestamp: event.timestamp.toISOString(),
            role: 'user',
            isCodeRelated,
            memoryBank
          }
        );
        
        // For code-related messages, also extract and store specific code concepts
        if (isCodeRelated) {
          await this.storeCodeKnowledge(event.data.message, event);
        }
      }
      
      // Store Rusty's response in appropriate memory bank
      await this.memoryClient.embed(
        response,
        memoryType,
        {
          source: event.source,
          eventType: event.type,
          username: 'RustyButter',
          channel: event.data?.channel,
          timestamp: new Date().toISOString(),
          role: 'assistant',
          memoryBank
        }
      );
      
      // For code responses, also extract and store solutions/patterns
      if (isCodeRelated && response) {
        await this.storeCodeKnowledge(response, event, true);
      }
      
      // Store user preferences if mentioned
      if (event.data?.user) {
        await this.extractAndStoreUserPreferences(event, response);
      }
      
      logger.debug(`🧠 Stored interaction in semantic memory (bank: ${memoryBank})`);
    } catch (error) {
      logger.warn('⚠️  Failed to store interaction in memory:', error);
    }
  }

  private determineRequiredMCPServers(event: Event): string[] {
    const servers: string[] = [];
    
    // Always include semantic-memory for all events
    servers.push('semantic-memory');
    
    // Include audio and avatar servers for chat messages
    if (event.type === 'chat_message' || event.data?.message) {
      servers.push('elevenlabs', 'avatar');
    }
    
    // Add specific servers based on source
    switch (event.source) {
      case 'discord':
        servers.push('discord-tools');
        break;
      case 'twitch':
        servers.push('twitch-chat');
        break;
    }
    
    // Override with required tools if specified
    if (event.requiredTools && event.requiredTools.length > 0) {
      // Still include semantic-memory even with override
      return ['semantic-memory', ...event.requiredTools];
    }
    
    return [...new Set(servers)]; // Remove duplicates
  }

  determineLLMProvider(event: Event): LLMProvider {
    // Analyze message content to determine if it's coding-related
    const message = event.data?.message || event.data?.text || '';
    const lowerMessage = message.toLowerCase();
    
    // Check for coding-related keywords and patterns
    const codingKeywords = [
      'code', 'coding', 'program', 'implement', 'feature', 'bug', 'fix', 
      'function', 'class', 'api', 'database', 'frontend', 'backend',
      'react', 'node', 'python', 'javascript', 'typescript', 'html', 'css',
      'build', 'compile', 'debug', 'error', 'exception', 'deploy',
      'git', 'github', 'repository', 'branch', 'commit', 'merge',
      'refactor', 'optimize', 'performance', 'algorithm', 'data structure',
      'help me write', 'help me implement', 'can you code', 'write a'
    ];
    
    const isCodingRelated = codingKeywords.some(keyword => lowerMessage.includes(keyword));
    
    // Check for project or feature requests (both project AND feature keywords required)
    const projectKeywords = ['project', 'app', 'website', 'tool', 'system', 'service'];
    const featureKeywords = ['add', 'create', 'build', 'implement', 'develop'];
    
    // Be more intelligent about "make" - only count if it's clearly project-related
    const hasMakeWithProject = lowerMessage.includes('make') && (
      lowerMessage.includes('make a') === false && // "make a" is usually conversational
      lowerMessage.includes('make an') === false && // "make an" is usually conversational  
      lowerMessage.includes('make me') === false && // "make me" is usually conversational
      lowerMessage.includes('make you') === false   // "make you" is usually conversational
    );
    
    const hasFeatureKeyword = featureKeywords.some(f => lowerMessage.includes(f)) || hasMakeWithProject;
    const isProjectRequest = projectKeywords.some(p => lowerMessage.includes(p)) && hasFeatureKeyword;
    
    // If it's coding-related or a project request, use Claude (Anthropic)
    if (isCodingRelated || isProjectRequest) {
      logger.info(`🎯 Routing to Claude for coding task: "${message.substring(0, 50)}..."`);
      return 'anthropic';
    }
    
    // Explicit code types still go to Claude
    if (event.type === 'code_review' || event.type === 'code_generation') {
      return 'anthropic';
    }
    
    // Route based on event type and source for non-coding messages
    if (event.source === 'twitter' || event.source === 'x') {
      return 'grok'; // Grok for Twitter/X
    }
    
    // For general chat messages, use voice-capable LLM with function calling
    if (event.type === 'chat_message' || event.type === 'chat' || event.type === 'speak') {
      // Use OpenAI for all voice-capable responses to enable function calling
      logger.info(`🎤 Routing to OpenAI for voice response with tools: "${message.substring(0, 50)}..."`);
      return 'openai'; // GPT-4 for all chat responses with voice and tools
    }
    
    if (event.type === 'memory_operation') {
      return 'groq'; // Groq for fast memory ops
    }
    
    // Default to OpenAI for general purposes
    return 'openai';
  }

  private processRetryQueue() {
    for (const [eventId, queuedEvent] of this.retryQueue.entries()) {
      logger.info(`Retrying event ${eventId} (attempt ${queuedEvent.retries}/${queuedEvent.maxRetries})`);
      this.retryQueue.delete(eventId);
      this.queueEvent(queuedEvent.event);
    }
  }

  private cleanupHangingOperations() {
    const now = Date.now();
    const OPERATION_TIMEOUT = 120000; // 2 minutes
    let cleanedUp = 0;

    for (const [operationId, operation] of this.activeLLMOperations.entries()) {
      const uptime = now - operation.startTime.getTime();
      
      if (uptime > OPERATION_TIMEOUT) {
        logger.warn(`🧹 Cleaning up hanging LLM operation: ${operationId} (${operation.provider}, ${uptime}ms)`);
        this.activeLLMOperations.delete(operationId);
        cleanedUp++;
      }
    }

    if (cleanedUp > 0) {
      logger.info(`🧹 Cleaned up ${cleanedUp} hanging LLM operations`);
    }
  }

  getStatus() {
    return {
      queueSize: this.eventQueue.size,
      queuePending: this.eventQueue.pending,
      voiceQueueSize: this.voiceQueue.size,
      voiceQueuePending: this.voiceQueue.pending,
      eventHistory: this.eventHistory.size,
      retryQueue: this.retryQueue.size,
      activeLLMOperations: Array.from(this.activeLLMOperations.values()),
      brainStatus: this.orchestratorBrain.getStatus()
    };
  }

  getActiveLLMOperations() {
    return Array.from(this.activeLLMOperations.values()).map(op => ({
      id: `llm-${op.eventId}`,
      eventId: op.eventId,
      provider: op.provider,
      type: op.type,
      status: 'running',
      uptime: Date.now() - op.startTime.getTime()
    }));
  }

  getEventHistory(): Event[] {
    return Array.from(this.eventHistory.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 100); // Keep last 100 events
  }

  // Helper methods for enhanced memory functionality
  private determineMemoryBank(event: Event): string {
    if (this.isCodeRelated(event)) {
      return 'code-knowledge';
    }
    
    if (event.source === 'twitch' || event.source === 'stream') {
      return 'streaming-context';
    }
    
    if (event.data?.message?.toLowerCase().includes('project')) {
      return 'project-context';
    }
    
    if (event.source === 'dashboard' || event.data?.user) {
      return 'user-interactions';
    }
    
    return 'general-knowledge';
  }

  private isCodeRelated(event: Event): boolean {
    if (!event.data?.message) return false;
    
    const message = event.data.message.toLowerCase();
    return /\b(code|bug|fix|debug|implement|function|class|variable|error|exception|api|database|server|deploy|build|test|typescript|javascript|python|react|node|npm|git|github|pull request|merge|commit|branch)\b/.test(message) ||
           /[\{\}\[\]();]/.test(message) ||
           message.includes('```') ||
           /\b(how to|help me|can you)\s+(write|create|build|make|fix|debug|implement)/.test(message);
  }

  private buildMemoryQuery(event: Event): string {
    let query = `${event.source} ${event.type}`;
    
    if (event.data?.message) {
      // Extract key concepts from the message
      const message = event.data.message.toLowerCase();
      
      // Add user context
      if (event.data.user || event.data.username) {
        query += ` user:${event.data.user || event.data.username}`;
      }
      
      // Add specific keywords for better matching
      const keywords = message.match(/\b(error|bug|fix|implement|create|help|problem|issue|question)\b/g);
      if (keywords) {
        query += ` ${keywords.join(' ')}`;
      }
      
      // Add the main message content (truncated to avoid overly long queries)
      query += ` ${event.data.message.substring(0, 100)}`;
    }
    
    return query.trim();
  }

  private async storeCodeKnowledge(content: string, event: Event, isResponse: boolean = false): Promise<void> {
    if (!this.memoryClient) return;
    
    try {
      // Extract code patterns, error messages, and solutions
      const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
      const errorPatterns = content.match(/\b(error|exception|failed|bug)[\s\S]{0,100}/gi) || [];
      
      // Store code blocks separately for better retrieval
      for (const codeBlock of codeBlocks) {
        await this.memoryClient.embed(
          codeBlock,
          'code',
          {
            source: event.source,
            type: 'code-snippet',
            timestamp: new Date().toISOString(),
            language: this.detectCodeLanguage(codeBlock),
            context: event.data?.message?.substring(0, 200),
            isResponse
          }
        );
      }
      
      // Store error patterns for debugging help
      for (const errorPattern of errorPatterns) {
        await this.memoryClient.embed(
          errorPattern,
          'code',
          {
            source: event.source,
            type: 'error-pattern',
            timestamp: new Date().toISOString(),
            context: content.substring(0, 300),
            isResponse
          }
        );
      }
    } catch (error) {
      logger.debug('Failed to store code knowledge:', error);
    }
  }

  private async extractAndStoreUserPreferences(event: Event, response: string): Promise<void> {
    if (!this.memoryClient || !event.data?.user) return;
    
    try {
      const content = `${event.data.message || ''} ${response}`.toLowerCase();
      
      // Extract preferences mentioned in conversation
      const preferences: string[] = [];
      
      if (content.includes('prefer') || content.includes('like')) {
        const prefMatches = content.match(/prefer[s]?\s+([^.!?]+)/gi) || [];
        const likeMatches = content.match(/like[s]?\s+([^.!?]+)/gi) || [];
        preferences.push(...prefMatches, ...likeMatches);
      }
      
      // Extract programming languages mentioned
      const languages = content.match(/\b(javascript|typescript|python|react|node|java|rust|go|cpp|c\+\+)\b/gi) || [];
      
      // Extract tools mentioned
      const tools = content.match(/\b(git|github|vscode|vim|docker|kubernetes|aws|azure)\b/gi) || [];
      
      if (preferences.length > 0 || languages.length > 0 || tools.length > 0) {
        const userProfile = {
          preferences: preferences.slice(0, 5), // Limit to avoid spam
          languages: [...new Set(languages)],
          tools: [...new Set(tools)],
          lastInteraction: new Date().toISOString()
        };
        
        await this.memoryClient.embed(
          JSON.stringify(userProfile),
          'chat',
          {
            source: event.source,
            type: 'user-profile',
            username: event.data.user,
            timestamp: new Date().toISOString(),
            context: 'preferences-extracted'
          }
        );
      }
    } catch (error) {
      logger.debug('Failed to extract user preferences:', error);
    }
  }

  private detectCodeLanguage(codeBlock: string): string {
    const firstLine = codeBlock.split('\n')[0].toLowerCase();
    
    if (firstLine.includes('typescript') || firstLine.includes('ts')) return 'typescript';
    if (firstLine.includes('javascript') || firstLine.includes('js')) return 'javascript';
    if (firstLine.includes('python') || firstLine.includes('py')) return 'python';
    if (firstLine.includes('rust') || firstLine.includes('rs')) return 'rust';
    if (firstLine.includes('bash') || firstLine.includes('sh')) return 'bash';
    if (firstLine.includes('json')) return 'json';
    if (firstLine.includes('yaml') || firstLine.includes('yml')) return 'yaml';
    
    // Detect by content patterns
    if (codeBlock.includes('function') && codeBlock.includes('=>')) return 'javascript';
    if (codeBlock.includes('def ') && codeBlock.includes(':')) return 'python';
    if (codeBlock.includes('fn ') && codeBlock.includes('->')) return 'rust';
    if (codeBlock.includes('interface') && codeBlock.includes(':')) return 'typescript';
    
    return 'unknown';
  }
}