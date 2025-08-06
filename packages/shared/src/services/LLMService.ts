import { getLogger } from '@rusty-butter/logger';
import { AudioProcessor, AudioConfig, AudioResponse } from './AudioProcessor.js';

const logger = getLogger('llm-service');

export interface LLMConfig {
  provider: 'openai' | 'grok' | 'gemini' | 'groq' | 'cerebras' | 'claude' | 'anthropic';
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  toolCalls?: any[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LLMService {
  private audioProcessor: AudioProcessor;
  
  constructor(private config: LLMConfig) {
    logger.info(`🤖 LLM Service initialized for provider: ${config.provider}`);
    this.audioProcessor = new AudioProcessor();
  }

  async generateResponse(messages: LLMMessage[], context?: string, tools?: any[]): Promise<LLMResponse> {
    logger.info(`📝 Generating response with ${this.config.provider}`);
    logger.info(`📊 Message count: ${messages.length}`);
    
    if (tools && tools.length > 0) {
      logger.info(`🔧 Tools available: ${tools.length}`);
    }
    
    try {
      // Add context from semantic memory if provided
      if (context) {
        messages.unshift({
          role: 'system',
          content: `Context from semantic memory:\n${context}\n\nUse this context to inform your response when relevant.`
        });
        logger.info(`🧠 Added semantic memory context (${context.length} chars)`);
      }

      const response = await this.callLLM(messages, tools);
      
      logger.info(`✅ Response generated successfully`);
      logger.info(`📈 Usage: ${response.usage?.total_tokens || 'N/A'} tokens`);
      
      return response;
    } catch (error) {
      logger.error(`❌ Failed to generate response:`, error);
      throw error;
    }
  }

  async generateAudioResponse(messages: LLMMessage[], audioConfig: AudioConfig = {}, context?: string): Promise<{ response: LLMResponse; audio: AudioResponse }> {
    logger.info(`🎵 Generating audio response with ${this.config.provider} + ElevenLabs`);
    
    try {
      // Generate text response first
      const response = await this.generateResponse(messages, context);
      
      // Generate audio from the response
      const audio = await this.generateAudio(response.content, audioConfig);
      
      logger.info(`✅ Audio response generated successfully`);
      return { response, audio };
    } catch (error) {
      logger.error(`❌ Failed to generate audio response:`, error);
      throw error;
    }
  }

  async generateAudio(text: string, config: AudioConfig = {}): Promise<AudioResponse> {
    return this.audioProcessor.generateAudio(text, config);
  }

  private async callLLM(messages: LLMMessage[], tools?: any[]): Promise<LLMResponse> {
    const model = this.config.model || this.getDefaultModel();
    
    switch (this.config.provider) {
      case 'openai':
        return this.callOpenAI(messages, model, tools);
      case 'grok':
        return this.callGrok(messages, model, tools);
      case 'gemini':
        return this.callGemini(messages, model);
      case 'groq':
        return this.callGroq(messages, model, tools);
      case 'cerebras':
        return this.callCerebras(messages, model, tools);
      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  private async callOpenAI(messages: LLMMessage[], model: string, tools?: any[]): Promise<LLMResponse> {
    const { OpenAI } = await import('openai');
    
    const openai = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl
    });

    const completionOptions: any = {
      model,
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 2000
    };
    
    // Add tools if provided
    if (tools && tools.length > 0) {
      completionOptions.tools = tools;
      completionOptions.tool_choice = 'auto';
    }

    const completion = await openai.chat.completions.create(completionOptions);

    const choice = completion.choices[0];
    
    // Check if there are tool calls in the response
    let toolCalls = undefined;
    if (choice?.message?.tool_calls) {
      toolCalls = choice.message.tool_calls;
    }

    return {
      content: choice?.message?.content || '',
      provider: this.config.provider,
      model,
      toolCalls,
      usage: completion.usage ? {
        prompt_tokens: completion.usage.prompt_tokens,
        completion_tokens: completion.usage.completion_tokens,
        total_tokens: completion.usage.total_tokens
      } : undefined
    };
  }

  private async callGrok(messages: LLMMessage[], model: string, tools?: any[]): Promise<LLMResponse> {
    // Grok uses OpenAI-compatible API
    return this.callOpenAI(messages, model, tools);
  }

  private async callGemini(messages: LLMMessage[], model: string): Promise<LLMResponse> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    
    const genAI = new GoogleGenerativeAI(this.config.apiKey);
    const geminiModel = genAI.getGenerativeModel({ model });

    // Convert messages to Gemini format
    const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n\n');
    
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    
    return {
      content: response.text(),
      provider: this.config.provider,
      model
    };
  }

  private async callGroq(messages: LLMMessage[], model: string, tools?: any[]): Promise<LLMResponse> {
    // Groq uses OpenAI-compatible API
    return this.callOpenAI(messages, model, tools);
  }

  private async callCerebras(messages: LLMMessage[], model: string, tools?: any[]): Promise<LLMResponse> {
    // Cerebras uses OpenAI-compatible API
    return this.callOpenAI(messages, model, tools);
  }

  private getDefaultModel(): string {
    switch (this.config.provider) {
      case 'openai':
        return 'gpt-4-turbo-preview';
      case 'grok':
        return 'grok-beta';
      case 'gemini':
        return 'gemini-1.5-flash';
      case 'groq':
        return 'llama2-70b-4096';
      case 'cerebras':
        return 'llama3.1-8b';
      default:
        return 'gpt-3.5-turbo';
    }
  }

  private getBaseUrl(): string {
    switch (this.config.provider) {
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'grok':
        return 'https://api.x.ai/v1';
      case 'groq':
        return 'https://api.groq.com/openai/v1';
      case 'cerebras':
        return 'https://api.cerebras.ai/v1';
      default:
        return this.config.baseUrl || 'https://api.openai.com/v1';
    }
  }
}