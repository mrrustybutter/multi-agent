/**
 * Smart LLM Router
 * Intelligently routes requests to the best available provider
 */

import { getLogger } from '@rusty-butter/logger';
import { LLMProvider, getBestProviderForUseCase } from '../config/LLMProviders.js';
import { Event } from '../types/Event.js';

const logger = getLogger('llm-router');

export type UseCase = 'coding' | 'chat' | 'fast' | 'social' | 'tools';

export interface RoutingDecision {
  provider: LLMProvider;
  useCase: UseCase;
  reason: string;
  confidence: number; // 0-1 scale
}

export class LLMRouter {
  private codingKeywords = [
    'code', 'coding', 'program', 'implement', 'feature', 'bug', 'fix',
    'function', 'class', 'api', 'database', 'frontend', 'backend',
    'react', 'node', 'python', 'javascript', 'typescript', 'html', 'css',
    'build', 'compile', 'debug', 'error', 'exception', 'deploy',
    'git', 'github', 'repository', 'branch', 'commit', 'merge',
    'refactor', 'optimize', 'performance', 'algorithm', 'data structure',
    'help me write', 'help me implement', 'can you code', 'write a'
  ];

  private socialKeywords = [
    'tweet', 'post', 'share', 'viral', 'trending', 'hashtag',
    'social media', 'instagram', 'tiktok', 'facebook', 'linkedin',
    'engagement', 'followers', 'likes', 'retweet', 'story'
  ];

  private fastResponseKeywords = [
    'quick', 'fast', 'brief', 'summary', 'tldr', 'short',
    'yes/no', 'simple', 'just tell me', 'one word'
  ];

  /**
   * Route an event to the best LLM provider
   */
  routeEvent(event: Event): RoutingDecision {
    const message = event.data?.message || event.data?.text || '';
    const lowerMessage = message.toLowerCase();
    const source = event.source;
    const type = event.type;

    logger.info(`🎯 Routing event from ${source}: "${message.substring(0, 50)}..."`);

    // Analyze content for use case determination
    const analysis = this.analyzeContent(lowerMessage, source, type);
    const bestProvider = getBestProviderForUseCase(analysis.useCase);

    const decision: RoutingDecision = {
      provider: bestProvider,
      useCase: analysis.useCase,
      reason: analysis.reason,
      confidence: analysis.confidence
    };

    logger.info(`📊 Routing decision: ${bestProvider} (${analysis.useCase}) - ${analysis.reason}`);
    return decision;
  }

  /**
   * Analyze content to determine use case
   */
  private analyzeContent(message: string, source: string, type: string): {
    useCase: UseCase;
    reason: string;
    confidence: number;
  } {
    // Check for coding-related content
    const codingScore = this.calculateKeywordScore(message, this.codingKeywords);
    if (codingScore > 0.3) {
      return {
        useCase: 'coding',
        reason: `High coding content score (${(codingScore * 100).toFixed(0)}%)`,
        confidence: codingScore
      };
    }

    // Check for explicit coding request patterns
    const codingPatterns = [
      /\b(help me|can you|write a?)\s+(write|create|build|implement|code)/i,
      /\b(fix|debug|solve)\s+(this|the)?\s*(bug|error|issue|problem)/i,
      /\b(how to|how do i)\s+(write|create|implement|build)/i
    ];

    for (const pattern of codingPatterns) {
      if (pattern.test(message)) {
        return {
          useCase: 'coding',
          reason: 'Explicit coding request pattern detected',
          confidence: 0.9
        };
      }
    }

    // Check for social media context
    if (source === 'twitter' || source === 'x') {
      return {
        useCase: 'social',
        reason: 'Twitter/X source requires social-aware responses',
        confidence: 0.8
      };
    }

    const socialScore = this.calculateKeywordScore(message, this.socialKeywords);
    if (socialScore > 0.2) {
      return {
        useCase: 'social',
        reason: `Social media content detected (${(socialScore * 100).toFixed(0)}%)`,
        confidence: socialScore
      };
    }

    // Check for fast response requests
    const fastScore = this.calculateKeywordScore(message, this.fastResponseKeywords);
    if (fastScore > 0.2 || message.length < 50) {
      return {
        useCase: 'fast',
        reason: fastScore > 0.2 
          ? `Fast response requested (${(fastScore * 100).toFixed(0)}%)`
          : 'Short message suggests quick response needed',
        confidence: Math.max(fastScore, 0.6)
      };
    }

    // Check if tools are likely needed (questions, requests for information)
    const toolPatterns = [
      /\b(recall|remember|find|search|look up)\b/i,
      /\b(what did|tell me about|information about)\b/i,
      /\b(previous|before|earlier|last time)\b/i,
      /\b(and then|also|after that)\s+(speak|say|generate|create)/i
    ];

    const needsTools = toolPatterns.some(pattern => pattern.test(message));
    if (needsTools || type === 'chat_message' || type === 'speak') {
      return {
        useCase: 'tools',
        reason: needsTools 
          ? 'Message indicates need for tool usage (memory, speech, etc.)'
          : 'Chat message type typically requires tool access',
        confidence: needsTools ? 0.8 : 0.6
      };
    }

    // Default to chat for general conversation
    return {
      useCase: 'chat',
      reason: 'General conversational content',
      confidence: 0.5
    };
  }

  /**
   * Calculate keyword matching score
   */
  private calculateKeywordScore(message: string, keywords: string[]): number {
    const words = message.split(/\s+/);
    let matches = 0;

    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        // Weight longer keywords more heavily
        matches += keyword.split(' ').length;
      }
    }

    // Normalize by message length
    return Math.min(matches / Math.max(words.length, 10), 1);
  }

  /**
   * Get routing explanation for debugging
   */
  explainRouting(event: Event): string {
    const decision = this.routeEvent(event);
    return `Event routed to ${decision.provider} for ${decision.useCase} use case. ${decision.reason} (confidence: ${(decision.confidence * 100).toFixed(0)}%)`;
  }
}