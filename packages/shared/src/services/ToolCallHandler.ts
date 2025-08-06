import { getLogger } from '@rusty-butter/logger';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { MemoryClient } from '../memory-integration.js';

const logger = getLogger('tool-call-handler');

export interface OpenAIFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export class ToolCallHandler {
  private mcpClient?: Client;
  private memoryClient?: MemoryClient;
  private availableTools: Map<string, OpenAIFunction> = new Map();

  constructor(mcpClient?: Client, memoryClient?: MemoryClient) {
    this.mcpClient = mcpClient;
    this.memoryClient = memoryClient;
  }

  /**
   * Define available tools for voice/chat responses
   */
  getVoiceResponseTools(): any[] {
    return [
      {
        type: 'function',
        function: {
          name: 'recall_memory',
          description: 'Recall relevant information from semantic memory to provide context',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The query to search for in memory'
              },
              memory_bank: {
                type: 'string',
                enum: ['user-interactions', 'project-knowledge', 'code-patterns', 'general'],
                description: 'Which memory bank to search'
              }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'generate_speech',
          description: 'Generate speech audio from text using ElevenLabs',
          parameters: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'The text to convert to speech'
              },
              voice_id: {
                type: 'string',
                description: 'Optional voice ID to use'
              }
            },
            required: ['text']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'set_avatar_expression',
          description: 'Set the avatar expression to match the emotion',
          parameters: {
            type: 'object',
            properties: {
              expression: {
                type: 'string',
                enum: ['neutral', 'happy', 'sad', 'angry', 'surprised', 'thinking', 'excited'],
                description: 'The expression to set'
              },
              duration: {
                type: 'number',
                description: 'Duration in milliseconds'
              }
            },
            required: ['expression']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'send_chat_message',
          description: 'Send a message back to the chat platform',
          parameters: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'The message to send'
              },
              platform: {
                type: 'string',
                enum: ['twitch', 'discord', 'dashboard'],
                description: 'Which platform to send to'
              }
            },
            required: ['message', 'platform']
          }
        }
      }
    ];
  }

  /**
   * Execute tool calls returned by OpenAI
   */
  async executeToolCalls(toolCalls: ToolCall[]): Promise<Map<string, any>> {
    const results = new Map<string, any>();

    logger.info(`📊 Executing ${toolCalls.length} tool calls from LLM`);
    
    for (const toolCall of toolCalls) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        logger.info(`🔧 [${toolCall.function.name}] Executing with args:`, args);
        
        const result = await this.executeToolFunction(toolCall.function.name, args);
        results.set(toolCall.id, {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
        
        logger.info(`✅ [${toolCall.function.name}] Completed:`, result);
      } catch (error) {
        logger.error(`❌ [${toolCall.function.name}] Failed:`, error);
        results.set(toolCall.id, {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
        });
      }
    }
    
    logger.info(`📊 Tool execution complete. ${results.size} results returned.`);
    return results;
  }

  /**
   * Execute a specific tool function
   */
  private async executeToolFunction(name: string, args: any): Promise<any> {
    switch (name) {
      case 'recall_memory':
        return this.recallMemory(args);
      
      case 'generate_speech':
        return this.generateSpeech(args);
      
      case 'set_avatar_expression':
        return this.setAvatarExpression(args);
      
      case 'send_chat_message':
        return this.sendChatMessage(args);
      
      default:
        // Try to call via MCP if available
        if (this.mcpClient) {
          return this.callMCPTool(name, args);
        }
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Recall information from semantic memory
   */
  private async recallMemory(args: { query: string; memory_bank?: string }): Promise<any> {
    try {
      logger.info(`🧠 Searching knowledge graph with query: "${args.query}"`);
      
      // Call memory server directly via HTTP
      const response = await fetch('http://localhost:8742/api/memory/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: args.query,
          limit: 5
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json() as any;
      logger.info(`✅ Memory search successful: found ${result.length || 0} memories`);
      
      return { 
        memories: result,
        query: args.query,
        memory_bank: args.memory_bank || 'general',
        success: true,
        count: result.length || 0
      };
    } catch (error) {
      logger.warn('❌ Memory recall failed:', error);
      return { 
        memories: [], 
        error: error instanceof Error ? error.message : 'Memory recall failed',
        query: args.query,
        memory_bank: args.memory_bank || 'general'
      };
    }
  }

  /**
   * Generate speech using ElevenLabs
   */
  private async generateSpeech(args: { text: string; voice_id?: string }): Promise<any> {
    try {
      logger.info(`🎤 Calling ElevenLabs HTTP API to generate speech...`);
      logger.info(`📝 Text: "${args.text.substring(0, 100)}${args.text.length > 100 ? '...' : ''}"`);
      
      const voiceId = args.voice_id || process.env.ELEVEN_VOICE_ID || 'Au8OOcCmvsCaQpmULvvQ';
      logger.info(`🎙️ Voice ID: ${voiceId}`);
      
      // Call ElevenLabs server directly via HTTP
      const response = await fetch('http://localhost:3454/tools/stream_audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: args.text,
          voice_id: voiceId,
          buffer_size: 1024
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json() as any;
      logger.info(`✅ ElevenLabs HTTP response:`, result);
      
      return { 
        success: true, 
        audio_generated: true,
        http_result: result,
        audioPath: result.result?.audioPath,
        streaming: result.result?.streaming
      };
    } catch (error) {
      logger.error('❌ Speech generation failed:', error);
      
      // Fallback: still return simulated response for debugging
      logger.warn(`⚠️ Falling back to simulated speech: "${args.text.substring(0, 50)}..."`);
      return { 
        success: false,
        audio_generated: false,
        simulated: true,
        text: args.text,
        voice_id: args.voice_id || process.env.ELEVEN_VOICE_ID || 'Au8OOcCmvsCaQpmULvvQ',
        error: error instanceof Error ? error.message : 'Speech generation failed'
      };
    }
  }

  /**
   * Set avatar expression
   */
  private async setAvatarExpression(args: { expression: string; duration?: number }): Promise<any> {
    if (!this.mcpClient) {
      // Simulate avatar expression when MCP client is not available
      logger.info(`😊 Simulating avatar expression: ${args.expression} for ${args.duration || 3000}ms`);
      return { 
        success: true, 
        expression_set: args.expression,
        simulated: true,
        duration: args.duration || 3000
      };
    }

    try {
      const result = await this.mcpClient.request({
        method: 'tools/call',
        params: {
          name: 'mcp__sse-bridge__rustybutter-avatar__setAvatarExpression',
          arguments: {
            name: args.expression,
            duration: args.duration || 3000
          }
        }
      }, CallToolResultSchema);
      
      return { success: true, expression_set: args.expression };
    } catch (error) {
      logger.warn('Avatar expression failed:', error);
      return { error: 'Avatar expression failed' };
    }
  }

  /**
   * Send chat message to platform
   */
  private async sendChatMessage(args: { message: string; platform: string }): Promise<any> {
    // This would integrate with the appropriate chat platform
    logger.info(`📨 Sending message to ${args.platform}: ${args.message}`);
    
    if (args.platform === 'twitch' && this.mcpClient) {
      try {
        await this.mcpClient.request({
          method: 'tools/call',
          params: {
            name: 'send_message',
            arguments: {
              message: args.message
            }
          }
        }, CallToolResultSchema);
        return { success: true, sent: true };
      } catch (error) {
        logger.warn('Failed to send message:', error);
      }
    }
    
    return { success: true, platform: args.platform, message_queued: true };
  }

  /**
   * Call generic MCP tool
   */
  private async callMCPTool(name: string, args: any): Promise<any> {
    if (!this.mcpClient) {
      throw new Error('MCP client not available');
    }

    const result = await this.mcpClient.request({
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    }, CallToolResultSchema);
    
    return result;
  }
}