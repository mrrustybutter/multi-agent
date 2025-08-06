/**
 * Unified LLM Provider Configuration
 * All providers use OpenAI-compatible API format
 */

export type LLMProvider = 'openai' | 'grok' | 'gemini' | 'groq' | 'cerebras' | 'anthropic';

export interface LLMProviderConfig {
  name: LLMProvider;
  baseUrl?: string;
  model: string;
  apiKeyEnv: string;
  maxTokens?: number;
  temperature?: number;
  supportsTools?: boolean;
  supportsStreaming?: boolean;
  description: string;
}

/**
 * Provider configurations - all use OpenAI-compatible format except Anthropic
 */
export const LLM_PROVIDERS: Record<LLMProvider, LLMProviderConfig> = {
  openai: {
    name: 'openai',
    model: 'gpt-4o',
    apiKeyEnv: 'OPENAI_API_KEY',
    maxTokens: 4096,
    temperature: 0.7,
    supportsTools: true,
    supportsStreaming: true,
    description: 'OpenAI GPT-4 - Best for complex reasoning and function calling'
  },
  
  grok: {
    name: 'grok',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-beta',
    apiKeyEnv: 'GROK_API_KEY',
    maxTokens: 4096,
    temperature: 0.7,
    supportsTools: true,
    supportsStreaming: true,
    description: 'X.AI Grok - Great for social media and creative responses'
  },
  
  gemini: {
    name: 'gemini',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-pro',
    apiKeyEnv: 'OPENROUTER_API_KEY', // Use OpenRouter for Gemini compatibility
    maxTokens: 4096,
    temperature: 0.7,
    supportsTools: true,
    supportsStreaming: true,
    description: 'Google Gemini via OpenRouter - Fast and efficient'
  },
  
  groq: {
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-70b-versatile',
    apiKeyEnv: 'GROQ_API_KEY',
    maxTokens: 4096,
    temperature: 0.7,
    supportsTools: true,
    supportsStreaming: true,
    description: 'Groq - Ultra-fast inference for quick responses'
  },
  
  cerebras: {
    name: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'llama3.1-70b',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    maxTokens: 4096,
    temperature: 0.7,
    supportsTools: false, // Limited tool support
    supportsStreaming: true,
    description: 'Cerebras - High-performance inference'
  },
  
  anthropic: {
    name: 'anthropic',
    model: 'claude-3-sonnet-20240229',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    maxTokens: 4096,
    temperature: 0.7,
    supportsTools: false, // Uses Claude Code proxy instead
    supportsStreaming: false,
    description: 'Anthropic Claude - Best for coding tasks (via Claude Code)'
  }
};

/**
 * Get available providers based on environment variables
 */
export function getAvailableProviders(): LLMProviderConfig[] {
  return Object.values(LLM_PROVIDERS).filter(provider => 
    process.env[provider.apiKeyEnv]
  );
}

/**
 * Get provider config by name
 */
export function getProviderConfig(provider: LLMProvider): LLMProviderConfig | null {
  const config = LLM_PROVIDERS[provider];
  if (!config || !process.env[config.apiKeyEnv]) {
    return null;
  }
  return config;
}

/**
 * Get the best provider for a specific use case
 */
export function getBestProviderForUseCase(useCase: 'coding' | 'chat' | 'fast' | 'social' | 'tools'): LLMProvider {
  const available = getAvailableProviders();
  
  switch (useCase) {
    case 'coding':
      // Prefer Anthropic for coding, fallback to OpenAI
      if (available.find(p => p.name === 'anthropic')) return 'anthropic';
      if (available.find(p => p.name === 'openai')) return 'openai';
      break;
      
    case 'tools':
    case 'chat':
      // Need function calling support - prefer OpenAI, then Grok
      if (available.find(p => p.name === 'openai')) return 'openai';
      if (available.find(p => p.name === 'grok')) return 'grok';
      if (available.find(p => p.name === 'gemini')) return 'gemini';
      if (available.find(p => p.name === 'groq')) return 'groq';
      break;
      
    case 'fast':
      // Prefer fast providers
      if (available.find(p => p.name === 'groq')) return 'groq';
      if (available.find(p => p.name === 'cerebras')) return 'cerebras';
      if (available.find(p => p.name === 'gemini')) return 'gemini';
      break;
      
    case 'social':
      // Prefer Grok for social media
      if (available.find(p => p.name === 'grok')) return 'grok';
      if (available.find(p => p.name === 'openai')) return 'openai';
      break;
  }
  
  // Fallback to first available provider
  return available[0]?.name || 'openai';
}