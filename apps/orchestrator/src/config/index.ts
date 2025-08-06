import { OrchestratorConfig, MCPServerConfig } from '../types';
import { configService } from '@rusty-butter/shared';

/**
 * Get dynamic configuration from MongoDB
 */
export const getConfig = async (): Promise<OrchestratorConfig> => {
  const config = await configService.getConfig();
  
  return {
    port: config.ports.orchestrator,
    maxConcurrency: config.performance.maxConcurrency,
    voiceQueueConcurrency: 1, // Voice messages processed sequentially
    eventTimeout: config.performance.timeout,
    retryDelay: 5000,
    maxRetries: config.performance.retryAttempts,
    mcpServers: [
      {
        name: 'semantic-memory',
        command: 'node', 
        args: [`${process.cwd()}/tools/semantic-memory/dist/index.js`],
        env: {
          NODE_ENV: 'production',
          SEMANTIC_MEMORY_DB_PATH: `${process.cwd()}/semantic_memory_banks`
        }
      }
    ] as MCPServerConfig[]
  };
};

/**
 * LLM Provider routing rules based on enabled providers
 */
export const getLLMRouting = async () => {
  const config = await configService.getConfig();
  const enabledProviders = Object.entries(config.llmProviders)
    .filter(([_, provider]) => provider.enabled)
    .map(([name]) => name);

  return {
    // Coding and technical tasks
    coding: enabledProviders.includes('claude') ? ['claude'] : enabledProviders,
    
    // Chat and social interactions
    chat: enabledProviders.filter(p => ['openai', 'claude'].includes(p)),
    
    // Quick responses
    quick: enabledProviders.filter(p => ['gemini', 'groq'].includes(p)),
    
    // Memory operations
    memory: enabledProviders.filter(p => ['groq', 'cerebras'].includes(p)),
    
    // Twitter/X specific
    twitter: enabledProviders.filter(p => ['grok', 'openai'].includes(p)),
    
    // Default fallback
    default: enabledProviders.includes('claude') ? ['claude'] : enabledProviders
  };
};