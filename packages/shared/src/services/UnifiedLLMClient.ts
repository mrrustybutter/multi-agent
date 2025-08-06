/**
 * Unified LLM Client
 * Handles all OpenAI-compatible providers with a single interface
 */

import OpenAI from 'openai';
import { getLogger } from '@rusty-butter/logger';
import { LLMProvider, LLMProviderConfig, getProviderConfig } from '../config/LLMProviders.js';

const logger = getLogger('unified-llm-client');

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

export interface LLMResponse {
  content: string;
  toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: LLMProvider;
}

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export class UnifiedLLMClient {
  private clients: Map<LLMProvider, OpenAI> = new Map();
  private configs: Map<LLMProvider, LLMProviderConfig> = new Map();

  constructor(providers: LLMProvider[]) {
    this.initializeClients(providers);
  }

  private initializeClients(providers: LLMProvider[]): void {
    for (const provider of providers) {
      const config = getProviderConfig(provider);
      if (!config) {
        logger.warn(`⚠️ Provider ${provider} not available (missing API key)`);
        continue;
      }

      // Skip Anthropic as it uses a different API format
      if (provider === 'anthropic') {
        logger.info(`📝 Skipping ${provider} (uses Claude Code proxy)`);
        continue;
      }

      try {
        const apiKey = process.env[config.apiKeyEnv];
        if (!apiKey) {
          logger.warn(`⚠️ API key not found for ${provider}: ${config.apiKeyEnv}`);
          continue;
        }

        const client = new OpenAI({
          apiKey,
          baseURL: config.baseUrl,
          ...(config.baseUrl?.includes('openrouter') && {
            defaultHeaders: {
              'HTTP-Referer': 'https://github.com/rusty-butter/multi-agent',
              'X-Title': 'RustyButter Multi-Agent System'
            }
          })
        });

        this.clients.set(provider, client);
        this.configs.set(provider, config);
        
        logger.info(`✅ ${provider} client initialized (${config.model})`);
      } catch (error) {
        logger.warn(`⚠️ Failed to initialize ${provider}:`, error);
      }
    }
  }

  /**
   * Generate a response using the specified provider
   */
  async generateResponse(
    provider: LLMProvider,
    messages: LLMMessage[],
    options: {
      tools?: LLMTool[];
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    } = {}
  ): Promise<LLMResponse> {
    const client = this.clients.get(provider);
    const config = this.configs.get(provider);
    
    if (!client || !config) {
      throw new Error(`Provider ${provider} not available`);
    }

    logger.info(`🤖 Generating response with ${provider} (${config.model})`);
    logger.info(`📊 Messages: ${messages.length}, Tools: ${options.tools?.length || 0}`);

    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: options.temperature ?? config.temperature,
        max_tokens: options.maxTokens ?? config.maxTokens,
        ...(options.tools && config.supportsTools && {
          tools: options.tools,
          tool_choice: 'auto'
        })
      });

      const choice = completion.choices[0];
      if (!choice) {
        throw new Error('No response from LLM');
      }

      const response: LLMResponse = {
        content: choice.message.content || '',
        model: completion.model,
        provider,
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens
        } : undefined
      };

      // Add tool calls if present
      if (choice.message.tool_calls) {
        response.toolCalls = choice.message.tool_calls;
        logger.info(`🔧 Response includes ${choice.message.tool_calls.length} tool calls`);
      }

      logger.info(`✅ Response generated (${response.usage?.totalTokens || 'unknown'} tokens)`);
      return response;

    } catch (error) {
      logger.error(`❌ Failed to generate response with ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(provider: LLMProvider): boolean {
    return this.clients.has(provider);
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): LLMProvider[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Get provider configuration
   */
  getProviderConfig(provider: LLMProvider): LLMProviderConfig | undefined {
    return this.configs.get(provider);
  }

  /**
   * Test connection to a provider
   */
  async testProvider(provider: LLMProvider): Promise<boolean> {
    const client = this.clients.get(provider);
    const config = this.configs.get(provider);
    
    if (!client || !config) {
      return false;
    }

    try {
      logger.info(`🧪 Testing connection to ${provider}...`);
      
      const response = await client.chat.completions.create({
        model: config.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
        temperature: 0
      });

      const success = !!response.choices[0]?.message?.content;
      logger.info(`${success ? '✅' : '❌'} ${provider} connection test: ${success ? 'passed' : 'failed'}`);
      return success;

    } catch (error) {
      logger.warn(`❌ ${provider} connection test failed:`, error);
      return false;
    }
  }
}