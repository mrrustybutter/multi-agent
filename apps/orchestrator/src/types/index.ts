export interface Event {
  id: string;
  source: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  data: any;
  context?: any;
  timestamp: Date;
  requiredTools?: string[];
}

export interface ClaudeConfig {
  role: string;
  prompt: string;
  mcpServers: string[];
  detached?: boolean;
  model?: string;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' | 'text' };
}

export interface ClaudeInstance {
  id: string;
  eventId: string;
  role: string;
  status: 'running' | 'completed' | 'failed';
  process: any;
  startTime: Date;
  parentId?: string;
  children: string[];
  output?: string[]; // Captured output from Claude
}

export interface QueuedEvent {
  event: Event;
  retries: number;
  maxRetries: number;
}

export interface MCPServerConfig {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: {
    type: string;
    url: string;
  };
}

export interface OrchestratorConfig {
  port: number;
  maxConcurrency: number;
  voiceQueueConcurrency: number;
  eventTimeout: number;
  retryDelay: number;
  maxRetries: number;
  mcpServers: MCPServerConfig[];
}

export type LLMProvider = 'anthropic' | 'openai' | 'gemini' | 'grok' | 'groq' | 'cerebras';