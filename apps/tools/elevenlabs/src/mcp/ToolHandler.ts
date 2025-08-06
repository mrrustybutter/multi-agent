import { MCPRequest, MCPResponse } from '../types';
import { ElevenLabsService } from '../services/ElevenLabsService';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('elevenlabs-tools');

export class ToolHandler {
  constructor(
    private elevenLabsService: ElevenLabsService
  ) {}

  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);
        
        case 'tools/list':
          return this.handleListTools(request);
        
        case 'tools/call':
          return this.handleToolCall(request);
        
        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`
            }
          };
      }
    } catch (error) {
      logger.error('Error handling MCP request:', error);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Internal error: ${error}`
        }
      };
    }
  }

  private handleInitialize(request: MCPRequest): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: 'elevenlabs-mcp-server',
          version: '1.0.0'
        }
      }
    };
  }

  private handleListTools(request: MCPRequest): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: this.getTools()
      }
    };
  }

  getTools() {
    return [
      {
        name: 'generate_audio',
        description: 'Generate speech from text using ElevenLabs',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The text to convert to speech (supports SSML)'
            },
            voice_id: {
              type: 'string',
              description: 'ElevenLabs voice ID (optional, defaults to Rusty voice)'
            },
            model_id: {
              type: 'string',
              description: 'Model ID (optional, defaults to eleven_flash_v2)',
              enum: ['eleven_flash_v2', 'eleven_monolingual_v1', 'eleven_multilingual_v2']
            },
            play_audio: {
              type: 'boolean',
              description: 'Whether to play the audio immediately (default: true)'
            }
          },
          required: ['text']
        }
      },
      {
        name: 'stream_audio',
        description: 'Stream and play audio with real-time buffering for lower latency',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The text to convert to speech (supports SSML)'
            },
            voice_id: {
              type: 'string',
              description: 'ElevenLabs voice ID (optional)'
            },
            model_id: {
              type: 'string',
              description: 'Model ID (optional)',
              enum: ['eleven_flash_v2', 'eleven_monolingual_v1', 'eleven_multilingual_v2']
            },
            buffer_size: {
              type: 'number',
              description: 'Buffer size in bytes before starting playback (default: 1024)'
            }
          },
          required: ['text']
        }
      },
      {
        name: 'list_voices',
        description: 'List available ElevenLabs voices',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }

  private async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    logger.info(`🔧 TOOL CALL START: ${name} (ID: ${request.id})`);
    logger.info(`📝 Arguments: ${JSON.stringify(args, null, 2)}`);

    try {
      let result: any;

      switch (name) {
        case 'generate_audio':
          logger.info(`🎵 Generating audio: "${args.text?.substring(0, 50)}${args.text?.length > 50 ? '...' : ''}"`);
          result = await this.elevenLabsService.generateAudio({
            text: args.text,
            voice_id: args.voice_id,
            model_id: args.model_id,
            voice_settings: args.voice_settings
          });
          break;

        case 'stream_audio':
          logger.info(`🎵 Streaming audio: "${args.text?.substring(0, 50)}${args.text?.length > 50 ? '...' : ''}"`);
          result = await this.elevenLabsService.streamAudio({
            text: args.text,
            voice_id: args.voice_id,
            model_id: args.model_id,
            buffer_size: args.buffer_size,
            voice_settings: args.voice_settings
          });
          break;

        case 'list_voices':
          logger.info(`🎤 Listing available voices`);
          result = await this.elevenLabsService.listVoices();
          break;

        default:
          logger.error(`❌ Unknown tool requested: ${name}`);
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            }
          };
      }

      const duration = Date.now() - startTime;
      logger.info(`✅ TOOL CALL SUCCESS: ${name} (ID: ${request.id}) - Duration: ${duration}ms`);
      logger.info(`📊 Result summary: ${typeof result === 'object' ? Object.keys(result).join(', ') : typeof result}`);

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`❌ TOOL CALL FAILED: ${name} (ID: ${request.id}) - Duration: ${duration}ms`);
      logger.error(`💥 Error details:`, error);
      
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Tool execution failed: ${error}`
        }
      };
    }
  }
}