/**
 * Configuration client for monitors and tools
 * Fetches configuration from MongoDB via the orchestrator API
 */

import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('config-client');

export interface MonitorConfig {
  discord?: {
    token: string;
    guildId: string;
  };
  twitch?: {
    username: string;
    oauth: string;
    channel: string;
  };
  elevenlabs?: {
    apiKey: string;
    voiceId: string;
  };
  [key: string]: any;
}

/**
 * Fetch configuration from orchestrator API
 * Falls back to environment variables if API is unavailable
 */
export async function getMonitorConfig(): Promise<MonitorConfig> {
  const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'http://localhost:8742';
  
  try {
    // Try to fetch from orchestrator API
    logger.info(`Fetching configuration from ${orchestratorUrl}/api/config`);
    
    const response = await fetch(`${orchestratorUrl}/api/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status} ${response.statusText}`);
    }
    
    const config: any = await response.json();
    logger.info('✅ Configuration loaded from orchestrator API');
    
    // Transform to monitor-friendly format
    return {
      discord: config.monitoring?.discordEnabled ? {
        token: config.monitoring.discordToken,
        guildId: config.monitoring.discordGuildId
      } : undefined,
      twitch: config.monitoring?.twitchEnabled ? {
        username: config.monitoring.twitchUsername,
        oauth: config.monitoring.twitchOAuth,
        channel: config.monitoring.twitchUsername
      } : undefined,
      elevenlabs: config.audio?.elevenLabsEnabled ? {
        apiKey: config.audio.elevenLabsApiKey,
        voiceId: config.audio.voiceId
      } : undefined,
      ...config
    };
    
  } catch (error) {
    logger.warn('Failed to fetch config from orchestrator, falling back to environment variables:', error);
    
    // Fallback to environment variables
    return {
      discord: process.env.DISCORD_TOKEN ? {
        token: process.env.DISCORD_TOKEN,
        guildId: process.env.DISCORD_GUILD_ID || process.env.DISCORD_GUILD || ''
      } : undefined,
      twitch: process.env.TWITCH_OAUTH ? {
        username: process.env.TWITCH_USERNAME || '',
        oauth: process.env.TWITCH_OAUTH,
        channel: process.env.TWITCH_CHANNEL || process.env.TWITCH_USERNAME || ''
      } : undefined,
      elevenlabs: process.env.ELEVEN_API_KEY ? {
        apiKey: process.env.ELEVEN_API_KEY,
        voiceId: process.env.ELEVEN_VOICE_ID || ''
      } : undefined
    };
  }
}

/**
 * Watch for configuration changes
 * Polls the orchestrator API periodically
 */
export function watchConfig(callback: (config: MonitorConfig) => void, intervalMs = 30000): () => void {
  let intervalId: NodeJS.Timeout;
  
  const checkConfig = async () => {
    try {
      const config = await getMonitorConfig();
      callback(config);
    } catch (error) {
      logger.error('Failed to check config:', error);
    }
  };
  
  // Initial check
  checkConfig();
  
  // Set up polling
  intervalId = setInterval(checkConfig, intervalMs);
  
  // Return cleanup function
  return () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
}