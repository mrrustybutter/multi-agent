import { EventEmitter } from 'events';
import { getLogger, getAgentLogger } from '@rusty-butter/logger';
import { Event, ClaudeConfig, LLMProvider } from '../../types';
import { getConfig, getLLMRouting } from '../../config';
import { ClaudeManager } from '../ClaudeManager';
import { OrchestratorBrain, RoutingDecision } from '../OrchestratorBrain';
import { PromptBuilder } from '../../utils/PromptBuilder';
import { 
  LLMMessage, 
  AudioConfig, 
  eventService,
  ToolCallHandler
} from '@rusty-butter/shared';

import { QueueManager } from './QueueManager';
import { LLMManager } from './LLMManager';
import { MemoryManager } from './MemoryManager';
import { MCPManager } from './MCPManager';
import { EventClassifier } from './EventClassifier';
import { ResponseProcessor } from './ResponseProcessor';

const logger = getLogger('event-processor');
const agentLogger = getAgentLogger('orchestrator');

export class EventProcessor extends EventEmitter {
  private eventHistory: Map<string, Event> = new Map();
  private claudeManager: ClaudeManager;
  private orchestratorBrain: OrchestratorBrain;
  private promptBuilder: PromptBuilder;
  private toolCallHandler: ToolCallHandler | null = null;
  private config: any;
  private llmRouting: any;
  
  // Modular components
  private queueManager: QueueManager;
  private llmManager: LLMManager;
  private memoryManager: MemoryManager;
  private mcpManager: MCPManager;
  private classifier: EventClassifier;
  private responseProcessor: ResponseProcessor;

  constructor(claudeManager: ClaudeManager) {
    super();
    this.claudeManager = claudeManager;
    this.promptBuilder = new PromptBuilder();
    
    // Initialize modular components
    this.queueManager = new QueueManager();
    this.llmManager = new LLMManager();
    this.memoryManager = new MemoryManager();
    this.mcpManager = new MCPManager();
    this.classifier = new EventClassifier();
    this.responseProcessor = new ResponseProcessor();
    
    // Will be initialized properly in initialize()
    this.orchestratorBrain = new OrchestratorBrain(claudeManager, null);
  }

  async initialize() {
    // Load configuration
    this.config = await getConfig();
    this.llmRouting = await getLLMRouting();
    
    // Update queue configuration
    this.queueManager.updateConfig(
      this.config.maxConcurrency,
      this.config.voiceQueueConcurrency
    );

    // Initialize all managers
    await this.llmManager.initialize();
    const memoryClient = await this.memoryManager.initialize();
    await this.mcpManager.initialize();
    
    // Initialize orchestrator brain with memory client
    this.orchestratorBrain = new OrchestratorBrain(this.claudeManager, memoryClient);
    await this.orchestratorBrain.initialize();
    
    // Initialize tool handler
    const elevenLabsConnection = this.mcpManager.getConnection('elevenlabs');
    
    if (elevenLabsConnection || memoryClient) {
      this.toolCallHandler = new ToolCallHandler(
        elevenLabsConnection?.client, 
        memoryClient || undefined
      );
      logger.info(`🔧 Tool call handler initialized with: ${[
        elevenLabsConnection ? 'ElevenLabs MCP' : null,
        memoryClient ? 'Memory client' : null
      ].filter(Boolean).join(', ')}`);
    } else {
      this.toolCallHandler = new ToolCallHandler();
      logger.info('🔧 Tool call handler initialized (no MCP clients available)');
    }

    // Start background tasks
    setInterval(() => this.processRetryQueue(), 30000);
    setInterval(() => this.cleanupHangingOperations(), 60000);
    
    logger.info('✅ Event processor initialized');
  }

  async queueEvent(event: Event): Promise<void> {
    // Store in history
    this.eventHistory.set(event.id, event);
    
    // Determine if this is a voice event
    const isVoice = this.classifier.isVoiceEvent(event);
    
    // Queue the event
    await this.queueManager.queueEvent(
      event, 
      isVoice,
      async (evt) => await this.processEvent(evt)
    );
  }

  private async processEvent(event: Event): Promise<void> {
    try {
      agentLogger.info(`🎯 Processing event ${event.id} from ${event.source}`);
      
      // Emit event for monitoring
      eventService.emit('event:processing', event);
      
      // Use orchestrator brain for routing decision
      let routingDecision: RoutingDecision;
      
      try {
        routingDecision = await this.orchestratorBrain.processEvent(event);
        logger.info(`🧠 Brain routing decision: ${routingDecision.provider}/${routingDecision.useCase} - ${routingDecision.reason}`);
      } catch (error) {
        logger.warn('❌ Brain routing failed, using fallback classifier:', error);
        // Fallback to simple classification
        const provider = this.classifier.determineLLMProvider(event);
        routingDecision = {
          provider: provider as any,
          useCase: 'chat',
          reason: 'Fallback classification',
          memoryBank: this.memoryManager.determineMemoryBank(event),
          requiresTools: this.mcpManager.determineRequiredMCPServers(event),
          priority: event.priority
        };
      }
      
      // Store event in the selected memory bank
      if (routingDecision.memoryBank) {
        await this.memoryManager.embedToMemory(
          this.responseProcessor.buildEventMessage(event),
          {
            type: 'event',
            source: event.source,
            eventId: event.id,
            user: event.data?.user
          },
          routingDecision.memoryBank
        );
      }
      
      // Process based on provider
      if (routingDecision.provider === 'claude' || routingDecision.provider === 'anthropic') {
        await this.processWithClaude(event, routingDecision);
      } else {
        await this.processWithLLM(event, routingDecision);
      }
      
      agentLogger.info(`✅ Event ${event.id} processed successfully`);
      eventService.emit('event:completed', event);
      
    } catch (error) {
      agentLogger.error(`❌ Failed to process event ${event.id}:`, error);
      eventService.emit('event:failed', { event, error });
      throw error;
    }
  }

  private async processWithClaude(event: Event, routing: RoutingDecision): Promise<void> {
    const prompt = await this.buildClaudePrompt(event, routing);
    
    const claudeConfig: ClaudeConfig = {
      role: 'event-processor',
      prompt,
      mcpServers: routing.requiresTools || [],
      detached: true
    };
    
    const result = await this.claudeManager.spawnClaude(claudeConfig, event.id);
    logger.info(`🤖 Spawned Claude instance ${result.instanceId} for event ${event.id}`);
  }

  private async processWithLLM(event: Event, routing: RoutingDecision): Promise<void> {
    const llmService = this.llmManager.getService(routing.provider as LLMProvider);
    
    if (!llmService) {
      logger.error(`❌ LLM service ${routing.provider} not available`);
      throw new Error(`LLM service ${routing.provider} not configured`);
    }
    
    const operationId = `llm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.llmManager.startOperation(operationId, event.id, routing.provider as LLMProvider, 'process');
    
    try {
      // Get semantic context
      const semanticContext = await this.memoryManager.getSemanticContext(event);
      
      // Build messages
      const messages: LLMMessage[] = [];
      
      // Add system message
      messages.push({
        role: 'system',
        content: this.promptBuilder.buildSystemPrompt(event.source, routing.useCase)
      });
      
      // Add semantic context if available
      if (semanticContext) {
        messages.push({
          role: 'system',
          content: `Relevant context from memory:\n${semanticContext}`
        });
      }
      
      // Add user message
      messages.push({
        role: 'user',
        content: this.responseProcessor.buildEventMessage(event)
      });
      
      // Generate response
      const response = await llmService.generateResponse(messages);
      
      if (response) {
        logger.info(`📝 ${routing.provider} generated response for event ${event.id}`);
        
        // Parse and process response
        const actionSummary = await this.responseProcessor.parseAndExtractActionSummary(
          event, 
          response, 
          routing.provider
        );
        
        // Store interaction and any extracted info
        await this.memoryManager.storeInteraction(event, response);
        await this.memoryManager.extractAndStoreUserPreferences(event, response);
        
        // Handle any tool calls in the response
        if (this.toolCallHandler && actionSummary.tools?.length > 0) {
          for (const tool of actionSummary.tools) {
            await this.toolCallHandler.handleToolCall(tool, event);
          }
        }
        
        // Emit response for other systems
        eventService.emit('llm:response', {
          eventId: event.id,
          provider: routing.provider,
          response,
          actionSummary
        });
      }
    } finally {
      this.llmManager.endOperation(operationId);
    }
  }

  private async buildClaudePrompt(event: Event, routing: RoutingDecision): Promise<string> {
    const semanticContext = await this.memoryManager.getSemanticContext(event);
    
    let prompt = this.promptBuilder.buildEventPrompt(event);
    
    if (semanticContext) {
      prompt = `Context from memory:\n${semanticContext}\n\n${prompt}`;
    }
    
    if (routing.requiresTools?.length > 0) {
      prompt += `\n\nAvailable MCP tools: ${routing.requiresTools.join(', ')}`;
    }
    
    return prompt;
  }

  private processRetryQueue() {
    this.queueManager.processRetryQueue(async (event) => await this.processEvent(event));
  }

  private cleanupHangingOperations() {
    this.llmManager.cleanupHangingOperations();
  }

  getStatus() {
    return {
      queues: this.queueManager.getStatus(),
      activeLLMOperations: this.llmManager.getActiveOperations(),
      eventHistorySize: this.eventHistory.size,
      mcpConnections: Array.from(this.mcpManager.getAllConnections().keys())
    };
  }

  getEventHistory(): Event[] {
    return Array.from(this.eventHistory.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 100);
  }

  async cleanup() {
    this.queueManager.clear();
    await this.mcpManager.cleanup();
    this.eventHistory.clear();
  }
}