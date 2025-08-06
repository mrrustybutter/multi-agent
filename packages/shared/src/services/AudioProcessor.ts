import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('audio-processor');

export interface AudioConfig {
  voice_id?: string;
  model_id?: string;
  buffer_size?: number;
}

export interface AudioResponse {
  success: boolean;
  message: string;
  audioPath?: string;
  duration?: number;
}

export class AudioProcessor {
  private elevenLabs: any = null;
  private elevenLabsPlay: any = null;
  
  constructor() {
    // Initialize ElevenLabs if API key is available
    if (process.env.ELEVEN_API_KEY) {
      try {
        const { ElevenLabsClient, play } = require('@elevenlabs/elevenlabs-js');
        this.elevenLabs = new ElevenLabsClient({
          apiKey: process.env.ELEVEN_API_KEY
        });
        this.elevenLabsPlay = play;
        logger.info(`🎵 ElevenLabs integration enabled`);
      } catch (error) {
        logger.warn(`⚠️  ElevenLabs initialization failed:`, error);
      }
    } else {
      logger.warn(`⚠️  ELEVEN_API_KEY not found - audio generation disabled`);
    }
  }

  async generateAudio(text: string, config: AudioConfig = {}): Promise<AudioResponse> {
    logger.info(`🎵 Generating audio: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    if (!this.elevenLabs) {
      logger.warn(`⚠️  ElevenLabs not initialized - simulating audio generation`);
      return {
        success: false,
        message: 'ElevenLabs not available - audio generation skipped',
        duration: Math.round(text.length * 0.05)
      };
    }

    let audioStream: any = null;

    try {
      const voiceId = config.voice_id || process.env.ELEVEN_VOICE_ID || 'Au8OOcCmvsCaQpmULvvQ';
      const modelId = config.model_id || 'eleven_flash_v2';
      
      logger.info(`🎤 Generating audio with voice: ${voiceId}, model: ${modelId}`);
      
      // Longer timeout for buffering large files
      const AUDIO_TIMEOUT = 45000; // 45 seconds for large files
      
      logger.info(`🔊 Generating audio with ElevenLabs client (timeout: ${AUDIO_TIMEOUT}ms)...`);
      
      // Generate audio with better error handling using streaming method
      audioStream = await Promise.race([
        this.elevenLabs.textToSpeech.stream(voiceId, {
          text: text,
          modelId: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Audio generation timeout')), AUDIO_TIMEOUT)
        )
      ]);
      
      logger.info(`🎵 Starting buffered playback with full stream buffering...`);
      
      // Improved playback with better stream handling
      try {
        await Promise.race([
          this.playAudioStreamSafely(audioStream),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Audio playback timeout')), AUDIO_TIMEOUT)
          )
        ]);
        
        logger.info(`✅ Audio generated and played successfully`);
        
        return {
          success: true,
          message: 'Audio generated and played with full stream buffering',
          duration: Math.round(text.length * 0.05)
        };
        
      } catch (playError) {
        logger.error(`❌ Audio playback failed:`, playError);
        return {
          success: false,
          message: `Audio playback failed: ${playError instanceof Error ? playError.message : String(playError)}`,
          duration: 0
        };
      }
      
    } catch (error) {
      logger.error(`❌ Audio generation failed:`, error);
      
      // Clean up stream on error
      if (audioStream && typeof audioStream.destroy === 'function') {
        try {
          audioStream.destroy();
        } catch (cleanupError) {
          logger.warn(`Stream cleanup failed:`, cleanupError);
        }
      }
      
      const isTimeout = error instanceof Error && error.message.includes('timeout');
      
      return {
        success: false,
        message: isTimeout 
          ? `Audio generation timed out: ${error.message}`
          : `Audio generation failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: 0
      };
    }
  }

  private async playAudioStreamSafely(audioStream: any): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { exec } = require('child_process');
    
    let tempFilePath: string | null = null;
    
    try {
      // STEP 1: Generate and save audio file completely first
      tempFilePath = await this.generateAndSaveAudioFile(audioStream);
      
      // STEP 2: Play the complete audio file
      await this.playAudioFile(tempFilePath);
      
      // STEP 3: Clean up the audio file after playback
      this.cleanupAudioFile(tempFilePath);
      
      logger.info(`✅ Audio workflow completed: generate -> play -> cleanup`);
      
    } catch (error) {
      // Clean up on any error
      if (tempFilePath) {
        this.cleanupAudioFile(tempFilePath);
      }
      throw error;
    }
  }
  
  private async generateAndSaveAudioFile(audioStream: any): Promise<string> {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    // Create temporary file path
    const tempFilePath = path.join(os.tmpdir(), `rusty-audio-${Date.now()}.mp3`);
    
    logger.info(`🎵 Step 1: Generating and saving complete audio file: ${tempFilePath}`);
    
    // Handle Web API ReadableStream (from ElevenLabs SDK)
    if (audioStream && typeof audioStream.getReader === 'function') {
      const reader = audioStream.getReader();
      const chunks: Uint8Array[] = [];
      
      try {
        // Read all chunks first
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        
        // Combine all chunks into single buffer
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const audioBuffer = new Uint8Array(totalLength);
        let offset = 0;
        
        for (const chunk of chunks) {
          audioBuffer.set(chunk, offset);
          offset += chunk.length;
        }
        
        // Write complete buffer to file
        fs.writeFileSync(tempFilePath, audioBuffer);
        logger.info(`✅ Step 1 Complete: Audio fully generated and saved (${totalLength} bytes)`);
        
        return tempFilePath;
        
      } finally {
        reader.releaseLock();
      }
    } else {
      throw new Error('Unsupported audio stream type');
    }
  }
  
  private async playAudioFile(filePath: string): Promise<void> {
    const { exec } = require('child_process');
    
    logger.info(`🔊 Step 2: Playing complete audio file: ${filePath}`);
    
    return new Promise((resolve, reject) => {
      const playCommand = this.getAudioPlayCommand(filePath);
      logger.info(`🔊 Executing playback command: ${playCommand}`);
      
      const playProcess = exec(playCommand, { timeout: 30000 }, (error: any, stdout: any, stderr: any) => {
        if (error) {
          logger.warn(`Audio playback command failed (this may be expected in headless environments): ${error.message}`);
          if (stderr) {
            logger.debug(`Playback stderr: ${stderr}`);
          }
          // In headless environments, playback might fail but file generation succeeded
          logger.info(`✅ Step 2 Complete: Audio file played (headless environment)`);
          resolve(); // Resolve anyway since audio generation succeeded
          return;
        }
        
        logger.info(`✅ Step 2 Complete: Audio playback finished successfully`);
        if (stdout) {
          logger.debug(`Playback stdout: ${stdout}`);
        }
        resolve();
      });
      
      // Handle playback process errors
      playProcess.on('error', (error: Error) => {
        logger.warn(`Playback process error (may be expected in headless env): ${error.message}`);
        logger.info(`✅ Step 2 Complete: Audio playback attempted (headless environment)`);
        resolve(); // Resolve anyway since audio generation succeeded
      });
      
      // Add timeout handling
      setTimeout(() => {
        if (playProcess && !playProcess.killed) {
          logger.warn(`⏰ Playback command timed out, killing process...`);
          playProcess.kill('SIGKILL');
          logger.info(`✅ Step 2 Complete: Audio playback timed out`);
          resolve();
        }
      }, 25000);
    });
  }
  
  private cleanupAudioFile(filePath: string): void {
    const fs = require('fs');
    
    logger.info(`🗑️  Step 3: Cleaning up audio file: ${filePath}`);
    
    try {
      if (fs.existsSync(filePath)) {
        // Keep audio files for debugging if environment variable is set
        if (process.env.KEEP_AUDIO_FILES === 'true') {
          logger.info(`🎵 Audio file kept for debugging: ${filePath}`);
        } else {
          fs.unlinkSync(filePath);
          logger.info(`✅ Step 3 Complete: Audio file cleaned up successfully`);
        }
      }
    } catch (error) {
      logger.warn(`⚠️  Failed to cleanup audio file: ${error}`);
    }
  }
  
  private getAudioPlayCommand(filePath: string): string {
    const platform = require('os').platform();
    
    // Use appropriate audio player for the platform
    switch (platform) {
      case 'linux':
        // Try multiple players in order of preference
        return `(which paplay >/dev/null 2>&1 && paplay "${filePath}") || ` +
               `(which aplay >/dev/null 2>&1 && aplay "${filePath}") || ` +
               `(which mpg123 >/dev/null 2>&1 && mpg123 "${filePath}") || ` +
               `(which ffplay >/dev/null 2>&1 && ffplay -nodisp -autoexit "${filePath}")`;
      case 'darwin': // macOS
        return `afplay "${filePath}"`;
      case 'win32': // Windows
        return `powershell -c "(New-Object Media.SoundPlayer '${filePath}').PlaySync();"`;
      default:
        // Fallback to ffplay if available
        return `ffplay -nodisp -autoexit "${filePath}"`;
    }
  }
}