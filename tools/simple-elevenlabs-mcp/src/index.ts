#!/usr/bin/env node

/**
 * Simple ElevenLabs MCP Server
 * Provides command-based MCP tools for text-to-speech using ElevenLabs API
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ElevenLabs configuration
const ELEVENLABS_API_KEY = process.env.ELEVEN_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVEN_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
const ELEVENLABS_MODEL_ID = process.env.ELEVEN_MODEL_ID || 'eleven_flash_v2';
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

class SimpleElevenLabsMCP {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: 'simple-elevenlabs-mcp', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'generate_audio',
          description: 'Generate speech audio from text using ElevenLabs',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'The text to convert to speech'
              },
              voice_id: {
                type: 'string',
                description: 'Voice ID to use (optional)',
                default: ELEVENLABS_VOICE_ID
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

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'generate_audio':
            return await this.generateAudio(args as { text: string; voice_id?: string });
            
          case 'list_voices':
            return await this.listVoices();
            
          default:
            return {
              content: [{ type: 'text', text: `Unknown tool: ${name}` }],
              isError: true
            };
        }
      } catch (error) {
        console.error(`Error in ${name}:`, error);
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    });
  }

  private async generateAudio(args: { text: string; voice_id?: string }) {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVEN_API_KEY not configured');
    }

    const voiceId = args.voice_id || ELEVENLABS_VOICE_ID;
    const text = args.text;

    console.error(`Generating audio for: "${text.substring(0, 50)}..."`);

    // Make request to ElevenLabs API
    const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.1
        },
        output_format: 'mp3_44100_64'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // Get audio data
    const audioBuffer = await response.arrayBuffer();
    
    // Save to temporary file
    const tempFile = join(tmpdir(), `elevenlabs-${Date.now()}.mp3`);
    writeFileSync(tempFile, Buffer.from(audioBuffer));

    console.error(`Audio saved to: ${tempFile}`);

    // Play the audio using ffplay (if available)
    try {
      const player = spawn('ffplay', ['-nodisp', '-autoexit', tempFile], {
        stdio: 'ignore'
      });
      
      player.on('close', () => {
        // Clean up temp file after playing
        try {
          unlinkSync(tempFile);
          console.error('Cleaned up temp audio file');
        } catch (err) {
          console.error('Failed to clean up temp file:', err);
        }
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully generated and played audio for text: "${text}"`
          }
        ]
      };
    } catch (playError) {
      console.error('Failed to play audio:', playError);
      return {
        content: [
          {
            type: 'text',
            text: `Generated audio but failed to play it. Audio saved to: ${tempFile}`
          }
        ]
      };
    }
  }

  private async listVoices() {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVEN_API_KEY not configured');
    }

    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const voices = data.voices || [];

    return {
      content: [
        {
          type: 'text',
          text: `Available voices: ${voices.map((v: any) => `${v.name} (${v.voice_id})`).join(', ')}`
        }
      ]
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Simple ElevenLabs MCP server started');
  }

  async stop() {
    await this.server.close();
  }
}

// Handle process termination
const mcpServer = new SimpleElevenLabsMCP();

process.on('SIGINT', async () => {
  console.error('Received SIGINT, shutting down...');
  await mcpServer.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Received SIGTERM, shutting down...');
  await mcpServer.stop();
  process.exit(0);
});

// Start the server
mcpServer.start().catch(error => {
  console.error('Failed to start Simple ElevenLabs MCP server:', error);
  process.exit(1);
});