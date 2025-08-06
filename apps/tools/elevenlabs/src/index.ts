#!/usr/bin/env tsx

/**
 * ElevenLabs MCP Server
 * Provides MCP tools for text-to-speech using ElevenLabs API
 */

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { getLogger } from '@rusty-butter/logger';
import { getPort } from '@rusty-butter/shared';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

const logger = getLogger('elevenlabs');

// Initialize Express app for SSE
const app = express();
app.use(cors());
app.use(express.json());

// ElevenLabs configuration
const ELEVENLABS_API_KEY = process.env.ELEVEN_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Default voice
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// SSE clients
const sseClients = new Set<express.Response>();

// SSE endpoint for MCP
app.get('/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  sseClients.add(res);
  logger.info('MCP client connected via SSE');

  // Send initial handshake
  res.write('event: initialize\n');
  res.write(`data: ${JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'elevenlabs',
        version: '0.1.0'
      }
    }
  })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
    logger.info('MCP client disconnected');
  });
});

// MCP tool: generate_audio
app.post('/tools/generate_audio', async (req, res) => {
  const { text, voice_id, model_id } = req.body;
  
  try {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }

    if (!text) {
      throw new Error('Text is required');
    }

    const voiceId = voice_id || ELEVENLABS_VOICE_ID;
    const modelId = model_id || 'eleven_monolingual_v1';
    
    logger.info(`Generating speech for: "${text.substring(0, 50)}..."`);

    // Make request to ElevenLabs API
    const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
    }

    // Save audio to temporary file
    const audioBuffer = await response.buffer();
    const audioPath = path.join('/tmp', `elevenlabs-${Date.now()}.mp3`);
    fs.writeFileSync(audioPath, audioBuffer);

    // Play audio using system audio player
    const audioPlayer = process.platform === 'darwin' ? 'afplay' : 
                       process.platform === 'linux' ? 'aplay' : 'mpg123';
    
    const playProcess = spawn(audioPlayer, [audioPath], {
      stdio: 'pipe'
    });

    playProcess.on('close', (code) => {
      // Clean up temporary file
      try {
        fs.unlinkSync(audioPath);
      } catch (e) {
        logger.warn(`Failed to clean up audio file: ${e}`);
      }
      
      if (code === 0) {
        logger.info('Audio playback completed successfully');
      } else {
        logger.warn(`Audio playback exited with code ${code}`);
      }
    });

    res.json({
      jsonrpc: '2.0',
      result: {
        success: true,
        message: 'Audio generated and playing',
        text: text,
        voice_id: voiceId,
        audio_path: audioPath
      }
    });

  } catch (error) {
    logger.error('Failed to generate audio:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -1,
        message: `Failed to generate audio: ${error}`
      }
    });
  }
});

// MCP tool: list_voices
app.post('/tools/list_voices', async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }

    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const data = await response.json() as any;
    
    res.json({
      jsonrpc: '2.0',
      result: {
        voices: data.voices || [],
        current_voice: ELEVENLABS_VOICE_ID
      }
    });

  } catch (error) {
    logger.error('Failed to list voices:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -1,
        message: `Failed to list voices: ${error}`
      }
    });
  }
});

// MCP tool: stream_audio - Stream and play audio with buffering
app.post('/tools/stream_audio', async (req, res) => {
  const { text, voice_id, model_id, buffer_size = 1024 } = req.body;
  
  try {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }

    if (!text) {
      throw new Error('Text is required');
    }

    const voiceId = voice_id || ELEVENLABS_VOICE_ID;
    const modelId = model_id || 'eleven_monolingual_v1';
    
    logger.info(`Streaming speech for: "${text.substring(0, 50)}..."`);

    // Make streaming request to ElevenLabs API
    const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        },
        optimize_streaming_latency: 2 // Optimize for lower latency
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
    }

    // Create a buffered stream processor
    const audioBuffer: Buffer[] = [];
    let totalSize = 0;
    let playbackStarted = false;
    let playProcess: ChildProcess | null = null;
    
    // Determine audio player based on platform
    const audioPlayer = process.platform === 'darwin' ? 'afplay' : 
                       process.platform === 'linux' ? 'ffplay' : 'mpg123';
    const playerArgs = process.platform === 'linux' ? 
                       ['-nodisp', '-autoexit', '-'] : ['-'];

    // Create transform stream for buffering
    const bufferStream = new Transform({
      transform(chunk: Buffer, encoding, callback) {
        audioBuffer.push(chunk);
        totalSize += chunk.length;
        
        // Start playback once we have enough data buffered (default 1KB)
        if (!playbackStarted && totalSize >= buffer_size) {
          playbackStarted = true;
          logger.info(`Starting audio playback with ${totalSize} bytes buffered`);
          
          // Start audio player process
          playProcess = spawn(audioPlayer, playerArgs, {
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          // Handle player errors
          playProcess.on('error', (err) => {
            logger.error(`Audio player error: ${err}`);
          });
          
          playProcess.on('close', (code) => {
            if (code === 0) {
              logger.info('Streaming audio playback completed successfully');
            } else {
              logger.warn(`Audio playback exited with code ${code}`);
            }
          });
          
          // Write buffered data to player
          audioBuffer.forEach(buf => {
            if (playProcess && playProcess.stdin && !playProcess.stdin.destroyed) {
              playProcess.stdin.write(buf);
            }
          });
        } else if (playbackStarted && playProcess && playProcess.stdin && !playProcess.stdin.destroyed) {
          // Continue streaming to player
          playProcess.stdin.write(chunk);
        }
        
        callback(null, chunk);
      }
    });

    // Process the stream
    const responseBody = response.body;
    if (!responseBody) {
      throw new Error('No response body from ElevenLabs API');
    }

    // response.body from node-fetch is already a Node.js stream
    const nodeStream = responseBody as NodeJS.ReadableStream;
    
    // Stream audio data
    nodeStream.pipe(bufferStream);
    
    // Also save to file for fallback
    const audioPath = path.join('/tmp', `elevenlabs-stream-${Date.now()}.mp3`);
    const fileStream = fs.createWriteStream(audioPath);
    bufferStream.pipe(fileStream);

    // Handle stream completion
    bufferStream.on('end', () => {
      if (playProcess && playProcess.stdin && !playProcess.stdin.destroyed) {
        playProcess.stdin.end();
      }
      logger.info(`Streaming completed. Total size: ${totalSize} bytes`);
    });

    res.json({
      jsonrpc: '2.0',
      result: {
        success: true,
        message: 'Audio streaming started',
        text: text,
        voice_id: voiceId,
        audio_path: audioPath,
        buffer_size: buffer_size,
        streaming: true
      }
    });

  } catch (error) {
    logger.error('Failed to stream audio:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -1,
        message: `Failed to stream audio: ${error}`
      }
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    api_key_configured: !!ELEVENLABS_API_KEY,
    voice_id: ELEVENLABS_VOICE_ID,
    timestamp: new Date().toISOString()
  });
});

// Tools list endpoint
app.get('/tools', (req, res) => {
  res.json({
    tools: [
      {
        name: 'generate_audio',
        description: 'Generate speech from text using ElevenLabs',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The text to convert to speech'
            },
            voice_id: {
              type: 'string',
              description: 'ElevenLabs voice ID (optional)'
            },
            model_id: {
              type: 'string',
              description: 'ElevenLabs model ID (optional)'
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
              description: 'The text to convert to speech'
            },
            voice_id: {
              type: 'string',
              description: 'ElevenLabs voice ID (optional)'
            },
            model_id: {
              type: 'string',
              description: 'ElevenLabs model ID (optional)'
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
    ]
  });
});

// Start server
const PORT = getPort('elevenlabs') || 3454;

app.listen(PORT, () => {
  logger.info(`ElevenLabs MCP Server running on port ${PORT}`);
  logger.info(`SSE endpoint: http://localhost:${PORT}/sse`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`API key configured: ${!!ELEVENLABS_API_KEY}`);
});