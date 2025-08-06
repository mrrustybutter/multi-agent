/**
 * Orchestrator Brain - Claude-based intelligent routing system
 * Uses Claude without tools for fast routing decisions
 */

import { getLogger, getAgentLogger } from '@rusty-butter/logger';
import { Event, ClaudeConfig } from '../types/index.js';
import { ClaudeManager } from './ClaudeManager.js';
import { MemoryClient } from '@rusty-butter/shared';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = getLogger('orchestrator-brain');
const agentLogger = getAgentLogger('orchestrator-brain');

export interface RoutingDecision {
  provider: 'claude' | 'openai' | 'gemini' | 'grok' | 'groq';
  model?: string;
  useCase: 'coding' | 'chat' | 'social' | 'research' | 'tools';
  reason: string;
  memoryBank: string;
  requiresTools: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export class OrchestratorBrain {
  private claudeManager: ClaudeManager;
  private memoryClient: MemoryClient | null = null;
  private orchestrationStrategy: string = '';
  private isInitialized = false;

  constructor(claudeManager: ClaudeManager, memoryClient: MemoryClient | null) {
    this.claudeManager = claudeManager;
    this.memoryClient = memoryClient;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    logger.info('🧠 Initializing Orchestrator Brain...');
    
    // Load orchestration strategy
    try {
      const strategyPath = path.join(process.cwd(), 'references', 'Orchestration_Strategy.md');
      this.orchestrationStrategy = await fs.readFile(strategyPath, 'utf-8');
      logger.info('📋 Loaded orchestration strategy');
    } catch (error) {
      logger.warn('⚠️ Could not load orchestration strategy, using defaults');
      this.orchestrationStrategy = this.getDefaultStrategy();
    }
    
    this.isInitialized = true;
    logger.info('✅ Orchestrator Brain initialized');
  }

  /**
   * Process an event and make routing decision using Claude without tools
   */
  async processEvent(event: Event): Promise<RoutingDecision> {
    const startTime = Date.now();
    const taskId = `brain-task-${event.id}`;
    
    agentLogger.taskStarted(taskId, `Analyzing ${event.type} from ${event.source}`);
    
    try {
      logger.info(`🧠 Brain analyzing event ${event.id}`);
      
      // Build prompt for Claude without any MCP tools
      const prompt = this.buildRoutingPrompt(event);
      
      // Spawn Claude instance WITHOUT any MCP servers for fast routing
      const config: ClaudeConfig = {
        role: 'orchestrator-brain',
        prompt,
        mcpServers: [], // No MCP servers - just pure routing logic
        detached: false
      };
      
      logger.info(`🧠 Spawning Claude for routing decision (no tools)`);
      
      // This should be much faster without MCP tools
      const result = await this.claudeManager.spawnClaude(config, event.id);
      
      // Parse the structured response
      let decision: RoutingDecision;
      try {
        if (!result.response) {
          throw new Error('No response from Claude brain');
        }
        
        // Extract JSON from the response (Claude should output JSON)
        const jsonMatch = result.response.match(/```json\n([\s\S]*?)\n```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : result.response;
        
        decision = JSON.parse(jsonStr);
        
        // Validate decision
        if (!decision.provider || !decision.useCase || !decision.memoryBank) {
          throw new Error('Invalid routing decision format');
        }
      } catch (parseError) {
        logger.error('Failed to parse brain response:', parseError);
        logger.debug('Raw response:', result.response);
        // Fallback to default routing
        decision = this.getDefaultRouting(event);
      }
      
      const duration = Date.now() - startTime;
      agentLogger.taskCompleted(taskId, duration);
      
      logger.info(`🧠 Brain decision: ${decision.provider}/${decision.useCase} - ${decision.reason}`);
      
      // Store event in memory asynchronously (don't wait)
      if (this.memoryClient && decision.memoryBank) {
        this.storeEventInMemory(event, decision).catch(error => {
          logger.warn('Failed to store event in memory:', error);
        });
      }
      
      return decision;
      
    } catch (error) {
      logger.error(`❌ Brain failed to analyze event ${event.id}:`, error);
      agentLogger.taskFailed(taskId, error as Error);
      
      // Return default routing on error
      return this.getDefaultRouting(event);
    }
  }

  /**
   * Build routing prompt for Claude
   */
  private buildRoutingPrompt(event: Event): string {
    return `You are an intelligent routing system. Analyze this event and determine the best LLM provider and memory bank.

## Orchestration Strategy:
${this.orchestrationStrategy}

## Event Details:
- ID: ${event.id}
- Source: ${event.source}
- Type: ${event.type}
- Priority: ${event.priority}
- Message: ${event.data?.message || 'N/A'}
- User: ${event.data?.user || 'Unknown'}

## Memory Banks Available:
- 'code': Programming solutions, code snippets, debugging approaches
- 'chat-history': User interactions, preferences, personal context
- 'conversations': Stream context, ongoing discussions
- 'documents': Project documentation, requirements, design decisions
- 'general': General knowledge, facts, miscellaneous information

## Available Providers:
- 'claude': Best for coding, technical questions, complex reasoning
- 'openai' (gpt-4o): Best for conversational responses, balanced interactions
- 'grok': Best for memes, banter, sarcastic responses, Twitch chat
- 'gemini': Best for research, factual queries, summarization
- 'groq': Best for fast responses, memory operations

## Your Task:
Analyze the event and respond with ONLY a JSON object (no markdown, no explanation):

{
  "provider": "claude" | "openai" | "grok" | "gemini" | "groq",
  "model": "specific-model-name" (optional),
  "useCase": "coding" | "chat" | "social" | "research" | "tools",
  "reason": "Brief explanation of why this provider was chosen",
  "memoryBank": "code" | "chat-history" | "conversations" | "documents" | "general",
  "requiresTools": ["list", "of", "required", "mcp", "servers"],
  "priority": "low" | "medium" | "high" | "critical"
}

Respond with ONLY the JSON object, no other text.`;
  }

  /**
   * Analyze event and determine best routing based on content (fallback method)
   */
  private analyzeAndRoute(event: Event): RoutingDecision {
    const message = event.data?.message?.toLowerCase() || '';
    
    // Check for code-related content
    const codeKeywords = ['code', 'bug', 'fix', 'debug', 'implement', 'function', 'error', 'api', 'build', 'deploy'];
    const isCodeRelated = codeKeywords.some(keyword => message.includes(keyword));
    
    if (isCodeRelated) {
      return {
        provider: 'claude',
        useCase: 'coding',
        reason: 'Detected code-related keywords',
        memoryBank: 'code',
        requiresTools: [],
        priority: event.priority
      };
    }
    
    // Check for meme/banter content
    const banterKeywords = ['lol', 'lmao', 'meme', 'joke', 'funny', 'wtf', 'bruh'];
    const isBanter = banterKeywords.some(keyword => message.includes(keyword));
    
    if (isBanter || event.source === 'twitch') {
      return {
        provider: 'grok',
        useCase: 'social',
        reason: event.source === 'twitch' ? 'Twitch chat - use Grok for banter' : 'Detected banter/meme content',
        memoryBank: 'conversations',
        requiresTools: ['elevenlabs', 'rustybutter-avatar'],
        priority: event.priority
      };
    }
    
    // Check for research/factual queries
    const researchKeywords = ['what is', 'how does', 'explain', 'why', 'when', 'where', 'who'];
    const isResearch = researchKeywords.some(keyword => message.includes(keyword));
    
    if (isResearch) {
      return {
        provider: 'gemini',
        useCase: 'research',
        reason: 'Detected research/factual query',
        memoryBank: 'general',
        requiresTools: [],
        priority: event.priority
      };
    }
    
    // Discord defaults to conversational
    if (event.source === 'discord') {
      return {
        provider: 'openai',
        model: 'gpt-4o',
        useCase: 'chat',
        reason: 'Discord - use GPT-4o for conversational responses',
        memoryBank: 'chat-history',
        requiresTools: ['discord-tools', 'elevenlabs', 'rustybutter-avatar'],
        priority: event.priority
      };
    }
    
    // Default to GPT-4o for general chat
    return {
      provider: 'openai',
      model: 'gpt-4o',
      useCase: 'chat',
      reason: 'General chat message',
      memoryBank: 'general',
      requiresTools: ['elevenlabs', 'rustybutter-avatar'],
      priority: event.priority
    };
  }

  /**
   * Build detailed analysis prompt (kept for reference)
   */
  private buildDetailedPrompt(event: Event): string {
    return `You are the Orchestrator Brain - the intelligent routing system for a multi-agent AI platform.

Your role is to:
1. Analyze incoming events
2. Decide which LLM provider and model to use
3. Determine the appropriate memory bank for storage
4. Identify required tools

## Orchestration Strategy:
${this.orchestrationStrategy}

## Event to Process:
- ID: ${event.id}
- Source: ${event.source}
- Type: ${event.type}
- Priority: ${event.priority}
- Timestamp: ${event.timestamp.toISOString()}
- Data: ${JSON.stringify(event.data, null, 2)}
${event.context ? `- Context: ${JSON.stringify(event.context, null, 2)}` : ''}

## Available Memory Banks:
- 'code': Programming solutions, code snippets, debugging approaches
- 'chat-history': User interactions, preferences, personal context
- 'conversations': Stream context, ongoing discussions
- 'documents': Project documentation, requirements, design decisions
- 'general': General knowledge, facts, miscellaneous information

## MCP Tools Available:
- semantic-memory: Memory storage and retrieval
- elevenlabs: Audio generation
- rustybutter-avatar: Avatar animations
- discord-tools: Discord interactions
- playwright-sse: Browser automation

## Your Task:
1. First, use mcp__semantic-memory__recall to check for relevant context
2. Analyze the event and determine the best routing
3. Store the event in the appropriate memory bank using mcp__semantic-memory__embed_text
4. Return a JSON response with your routing decision

## Required JSON Response Format:
{
  "provider": "claude" | "openai" | "gemini" | "grok" | "groq",
  "model": "specific-model-name" (optional),
  "useCase": "coding" | "chat" | "social" | "research" | "tools",
  "reason": "Brief explanation of why this provider was chosen",
  "memoryBank": "code" | "chat-history" | "conversations" | "documents" | "general",
  "requiresTools": ["list", "of", "required", "mcp", "servers"],
  "priority": "low" | "medium" | "high" | "critical"
}

## Decision Guidelines:
- Coding/Technical → Claude (code bank)
- Chat/Conversation → GPT-4o (chat-history or conversations bank)
- Memes/Banter → Grok (conversations bank)
- Research/Facts → Gemini (documents or general bank)
- Audio/Voice → Include elevenlabs in requiresTools
- Discord → Include discord-tools in requiresTools

Analyze the event and provide your routing decision as JSON.`;
  }

  /**
   * Store event and decision in semantic memory
   */
  private async storeEventInMemory(event: Event, decision: RoutingDecision): Promise<void> {
    if (!this.memoryClient) return;
    
    try {
      const content = `Event: ${event.type} from ${event.source}\n` +
                     `Message: ${event.data?.message || 'N/A'}\n` +
                     `User: ${event.data?.user || event.data?.username || 'Unknown'}\n` +
                     `Routing: ${decision.provider}/${decision.useCase}\n` +
                     `Reason: ${decision.reason}\n` +
                     `Timestamp: ${event.timestamp.toISOString()}`;
      
      await this.memoryClient.embed(
        content,
        decision.memoryBank,
        {
          eventId: event.id,
          source: event.source,
          type: event.type,
          provider: decision.provider,
          useCase: decision.useCase
        }
      );
      
      logger.debug(`🧠 Stored event in ${decision.memoryBank} memory bank`);
    } catch (error) {
      logger.warn('Failed to store event in memory:', error);
    }
  }

  /**
   * Get default routing when brain fails
   */
  private getDefaultRouting(event: Event): RoutingDecision {
    // Simple rule-based fallback
    const message = event.data?.message?.toLowerCase() || '';
    
    // Check for code-related keywords
    if (/\b(code|bug|fix|debug|implement|function|error|api)\b/.test(message)) {
      return {
        provider: 'claude',
        useCase: 'coding',
        reason: 'Detected code-related keywords',
        memoryBank: 'code',
        requiresTools: [],
        priority: event.priority
      };
    }
    
    // Check source
    if (event.source === 'twitch') {
      return {
        provider: 'grok',
        useCase: 'social',
        reason: 'Twitch chat defaults to Grok for banter',
        memoryBank: 'conversations',
        requiresTools: ['elevenlabs'],
        priority: event.priority
      };
    }
    
    if (event.source === 'discord') {
      return {
        provider: 'openai',
        model: 'gpt-4o',
        useCase: 'chat',
        reason: 'Discord defaults to GPT-4o for conversational responses',
        memoryBank: 'chat-history',
        requiresTools: ['discord-tools', 'elevenlabs'],
        priority: event.priority
      };
    }
    
    // Default to GPT-4o for general chat
    return {
      provider: 'openai',
      model: 'gpt-4o',
      useCase: 'chat',
      reason: 'Default routing for general messages',
      memoryBank: 'general',
      requiresTools: [],
      priority: event.priority
    };
  }

  /**
   * Get default strategy if file not found
   */
  private getDefaultStrategy(): string {
    return `## Default Orchestration Strategy

### Model Selection:
- **Claude**: Code generation, debugging, technical questions
- **GPT-4o**: Conversational responses, balanced interactions
- **Grok**: Memes, banter, sarcastic responses
- **Gemini**: Research, factual queries, summarization
- **Groq**: Fast responses, memory operations

### Routing by Source:
- Twitch → Grok (banter) or GPT-4o (Q&A)
- Discord → GPT-4o (conversation) or Claude (technical)
- Dashboard → Based on content analysis
- Social → Grok (memes) or Gemini (informative)`;
  }

  /**
   * Get brain status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      hasMemory: this.memoryClient !== null,
      hasStrategy: this.orchestrationStrategy.length > 0
    };
  }
}