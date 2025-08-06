import { LLMService, LLMConfig, LLMMessage } from '@rusty-butter/shared';
import { LLMProvider } from '../../types';
import { getLogger } from '@rusty-butter/logger';
import { getConfig } from '../../config';

const logger = getLogger('llm-manager');

export class LLMManager {
  private llmServices: Map<LLMProvider, LLMService> = new Map();
  private activeLLMOperations: Map<string, {
    eventId: string;
    provider: LLMProvider;
    startTime: Date;
    type: string;
  }> = new Map();

  async initialize() {
    const config = await getConfig();
    
    // Initialize OpenAI service
    if (config.openai?.apiKey) {
      this.llmServices.set('openai', new LLMService({
        provider: 'openai',
        apiKey: config.openai.apiKey,
        baseUrl: config.openai.baseURL,
        model: config.openai.model || 'gpt-4o',
        temperature: config.openai.temperature || 0.7,
        maxTokens: config.openai.maxTokens || 2000
      }));
      logger.info('✅ OpenAI LLM service initialized');
    }

    // Initialize Gemini service
    if (config.gemini?.apiKey) {
      this.llmServices.set('gemini', new LLMService({
        provider: 'gemini',
        apiKey: config.gemini.apiKey,
        model: config.gemini.model || 'gemini-pro',
        temperature: config.gemini.temperature || 0.7,
        maxTokens: config.gemini.maxTokens || 2000
      }));
      logger.info('✅ Gemini LLM service initialized');
    }

    // Initialize Grok service if API key in env
    if (process.env.GROK_API_KEY) {
      this.llmServices.set('grok', new LLMService({
        provider: 'grok' as any,
        apiKey: process.env.GROK_API_KEY,
        baseUrl: process.env.GROK_BASE_URL || 'https://api.x.ai/v1',
        model: 'grok-2',
        temperature: 0.8,
        maxTokens: 2000
      }));
      logger.info('✅ Grok LLM service initialized');
    }

    // Initialize Groq service if API key in env
    if (process.env.GROQ_API_KEY) {
      this.llmServices.set('groq', new LLMService({
        provider: 'groq' as any,
        apiKey: process.env.GROQ_API_KEY,
        baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
        model: 'mixtral-8x7b-32768',
        temperature: 0.7,
        maxTokens: 2000
      }));
      logger.info('✅ Groq LLM service initialized');
    }
  }

  getService(provider: LLMProvider): LLMService | undefined {
    return this.llmServices.get(provider);
  }

  startOperation(operationId: string, eventId: string, provider: LLMProvider, type: string) {
    this.activeLLMOperations.set(operationId, {
      eventId,
      provider,
      startTime: new Date(),
      type
    });
  }

  endOperation(operationId: string) {
    this.activeLLMOperations.delete(operationId);
  }

  getActiveOperations() {
    return Array.from(this.activeLLMOperations.entries()).map(([id, op]) => ({
      id,
      ...op,
      duration: Date.now() - op.startTime.getTime()
    }));
  }

  cleanupHangingOperations(maxAge: number = 120000) {
    const now = Date.now();
    for (const [id, op] of this.activeLLMOperations.entries()) {
      if (now - op.startTime.getTime() > maxAge) {
        logger.warn(`🧹 Cleaning up hanging LLM operation ${id} (${op.provider})`);
        this.activeLLMOperations.delete(id);
      }
    }
  }
}