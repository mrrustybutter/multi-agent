import fetch from 'node-fetch';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Transform } from 'stream';
import { AudioGenerationParams, StreamAudioParams, Voice } from '../types';
import { getLogger } from '@rusty-butter/logger';
import { getMonitorConfig, watchConfig } from '@rusty-butter/shared';

const logger = getLogger('elevenlabs-service');

export class ElevenLabsService {
  private apiKey: string;
  private defaultVoiceId: string;
  private readonly apiUrl = 'https://api.elevenlabs.io/v1';

  constructor() {
    this.apiKey = '';
    this.defaultVoiceId = 'Au8OOcCmvsCaQpmULvvQ';
    this.loadConfig();
  }

  private async loadConfig() {
    try {
      const config = await getMonitorConfig();
      if (config.elevenlabs) {
        this.apiKey = config.elevenlabs.apiKey || '';
        this.defaultVoiceId = config.elevenlabs.voiceId || this.defaultVoiceId;
        logger.info(`ElevenLabs config loaded from MongoDB - Voice: ${this.defaultVoiceId}`);
      } else {
        // Fallback to env
        this.apiKey = process.env.ELEVEN_API_KEY || '';
        this.defaultVoiceId = process.env.ELEVENLABS_VOICE_ID || this.defaultVoiceId;
        logger.warn('Using environment variables for ElevenLabs config');
      }
      
      if (!this.apiKey) {
        logger.warn('ElevenLabs API key not configured');
      }
      
      // Watch for config changes
      watchConfig((newConfig) => {
        if (newConfig.elevenlabs) {
          this.apiKey = newConfig.elevenlabs.apiKey || this.apiKey;
          this.defaultVoiceId = newConfig.elevenlabs.voiceId || this.defaultVoiceId;
          logger.info('ElevenLabs config updated');
        }
      });
    } catch (error) {
      logger.error('Failed to load config:', error);
      // Fallback to env
      this.apiKey = process.env.ELEVEN_API_KEY || '';
      this.defaultVoiceId = process.env.ELEVENLABS_VOICE_ID || this.defaultVoiceId;
    }
  }

  async generateAudio(params: AudioGenerationParams): Promise<{
    success: boolean;
    message: string;
    audioPath?: string;
    error?: string;
  }> {
    try {
      this.validateApiKey();
      
      const voiceId = params.voice_id || this.defaultVoiceId;
      const modelId = params.model_id || 'eleven_flash_v2';
      
      logger.info(`Generating speech for: "${params.text.substring(0, 50)}..."`);

      const response = await fetch(`${this.apiUrl}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text: params.text,
          model_id: modelId,
          voice_settings: params.voice_settings || {
            stability: 0.5,
            similarity_boost: 0.5
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
      }

      const audioBuffer = await response.buffer();
      const audioPath = path.join('/tmp', `elevenlabs-${Date.now()}.mp3`);
      fs.writeFileSync(audioPath, audioBuffer);

      // Play audio
      await this.playAudio(audioPath);

      return {
        success: true,
        message: 'Audio generated and playing',
        audioPath
      };
    } catch (error) {
      logger.error('Failed to generate audio:', error);
      return {
        success: false,
        message: 'Failed to generate audio',
        error: (error as Error).message
      };
    }
  }

  async streamAudio(params: StreamAudioParams): Promise<{
    success: boolean;
    message: string;
    audioPath?: string;
    streaming?: boolean;
    error?: string;
  }> {
    try {
      this.validateApiKey();

      const voiceId = params.voice_id || this.defaultVoiceId;
      const modelId = params.model_id || 'eleven_flash_v2';
      const bufferSize = params.buffer_size || 1024;
      
      logger.info(`Streaming speech for: "${params.text.substring(0, 50)}..."`);

      const response = await fetch(`${this.apiUrl}/text-to-speech/${voiceId}/stream`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text: params.text,
          model_id: modelId,
          voice_settings: params.voice_settings || {
            stability: 0.5,
            similarity_boost: 0.5
          },
          optimize_streaming_latency: params.optimize_streaming_latency || 2
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
      }

      const audioPath = path.join('/tmp', `elevenlabs-stream-${Date.now()}.mp3`);
      await this.streamToFile(response.body as NodeJS.ReadableStream, audioPath, bufferSize);

      return {
        success: true,
        message: 'Audio streaming started',
        audioPath,
        streaming: true
      };
    } catch (error) {
      logger.error('Failed to stream audio:', error);
      return {
        success: false,
        message: 'Failed to stream audio',
        error: (error as Error).message
      };
    }
  }

  async listVoices(): Promise<{
    voices: Voice[];
    currentVoice: string;
  }> {
    try {
      this.validateApiKey();

      const response = await fetch(`${this.apiUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      const data = await response.json() as any;
      
      return {
        voices: data.voices || [],
        currentVoice: this.defaultVoiceId
      };
    } catch (error) {
      logger.error('Failed to list voices:', error);
      return {
        voices: [],
        currentVoice: this.defaultVoiceId
      };
    }
  }

  private validateApiKey() {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }
  }

  private async playAudio(audioPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audioPlayer = this.getAudioPlayer();
      const playerArgs = this.getPlayerArgs(audioPath);
      
      const playProcess = spawn(audioPlayer, playerArgs, {
        stdio: 'pipe'
      });

      playProcess.on('close', (code) => {
        try {
          fs.unlinkSync(audioPath);
        } catch (e) {
          logger.warn(`Failed to clean up audio file: ${e}`);
        }
        
        if (code === 0) {
          logger.info('Audio playback completed successfully');
          resolve();
        } else {
          logger.warn(`Audio playback exited with code ${code}`);
          resolve(); // Don't reject on playback issues
        }
      });

      playProcess.on('error', (err) => {
        logger.error(`Audio player error: ${err}`);
        reject(err);
      });
    });
  }

  private async streamToFile(
    stream: NodeJS.ReadableStream,
    audioPath: string,
    bufferSize: number
  ): Promise<void> {
    const audioBuffer: Buffer[] = [];
    let totalSize = 0;
    let playbackStarted = false;
    let playProcess: ChildProcess | null = null;
    
    const audioPlayer = this.getAudioPlayer();
    const playerArgs = process.platform === 'linux' ? 
                       ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-'] : ['-'];

    const bufferStream = new Transform({
      transform(chunk: Buffer, encoding, callback) {
        audioBuffer.push(chunk);
        totalSize += chunk.length;
        
        if (!playbackStarted && totalSize >= bufferSize) {
          playbackStarted = true;
          logger.info(`Starting audio playback with ${totalSize} bytes buffered`);
          
          playProcess = spawn(audioPlayer, playerArgs, {
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
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
          
          audioBuffer.forEach(buf => {
            if (playProcess && playProcess.stdin && !playProcess.stdin.destroyed) {
              playProcess.stdin.write(buf);
            }
          });
        } else if (playbackStarted && playProcess && playProcess.stdin && !playProcess.stdin.destroyed) {
          playProcess.stdin.write(chunk);
        }
        
        callback(null, chunk);
      }
    });

    const fileStream = fs.createWriteStream(audioPath);
    
    return new Promise((resolve, reject) => {
      stream.pipe(bufferStream).pipe(fileStream);
      
      bufferStream.on('end', () => {
        if (playProcess && playProcess.stdin && !playProcess.stdin.destroyed) {
          playProcess.stdin.end();
        }
        logger.info(`Streaming completed. Total size: ${totalSize} bytes`);
        resolve();
      });
      
      bufferStream.on('error', reject);
    });
  }

  private getAudioPlayer(): string {
    if (process.platform === 'darwin') return 'afplay';
    if (process.platform === 'linux') return 'ffplay';
    return 'mpg123';
  }

  private getPlayerArgs(audioPath: string): string[] {
    if (process.platform === 'linux') {
      return ['-nodisp', '-autoexit', '-loglevel', 'quiet', audioPath];
    }
    return [audioPath];
  }
}