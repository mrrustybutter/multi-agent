import { getLogger } from '@rusty-butter/logger';
import { Config, IConfig } from '../models/Config';
import { db } from './DatabaseService';

const logger = getLogger('config-service');

class ConfigService {
  private static instance: ConfigService;
  private config: IConfig | null = null;
  private lastFetch: number = 0;
  private readonly CACHE_TTL = 30000; // 30 seconds

  private constructor() {}

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Get the latest configuration
   * Uses caching to prevent frequent DB hits
   */
  async getConfig(): Promise<IConfig> {
    const now = Date.now();
    
    // Return cached config if within TTL
    if (this.config && (now - this.lastFetch) < this.CACHE_TTL) {
      return this.config;
    }

    try {
      // Ensure DB connection
      if (!db.isConnectedToDatabase()) {
        await db.connect();
      }

      // Get latest config
      const config = await Config.findOne().sort({ updatedAt: -1 });
      
      if (!config) {
        throw new Error('No configuration found in database');
      }

      this.config = config;
      this.lastFetch = now;
      
      return config;

    } catch (error) {
      logger.error('Failed to get configuration:', error);
      throw error;
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<IConfig>, updatedBy: string): Promise<IConfig> {
    try {
      // Ensure DB connection
      if (!db.isConnectedToDatabase()) {
        await db.connect();
      }

      // Get current config
      let config = await Config.findOne().sort({ updatedAt: -1 });
      
      if (!config) {
        // Create new config if none exists
        config = new Config(updates);
      } else {
        // Update existing config
        Object.assign(config, updates);
      }

      // Set metadata
      config.updatedBy = updatedBy;
      config.updatedAt = new Date();

      // Save to DB
      await config.save();

      // Update cache
      this.config = config;
      this.lastFetch = Date.now();

      logger.info(`Configuration updated by ${updatedBy}`);
      return config;

    } catch (error) {
      logger.error('Failed to update configuration:', error);
      throw error;
    }
  }

  /**
   * Get specific configuration value
   */
  async get<T>(path: string): Promise<T> {
    const config = await this.getConfig();
    
    return path.split('.').reduce((obj: any, key: string) => {
      if (obj && typeof obj === 'object') {
        return obj[key];
      }
      return undefined;
    }, config) as T;
  }

  /**
   * Update specific configuration value
   */
  async set(path: string, value: any, updatedBy: string): Promise<void> {
    const updates = path.split('.').reduceRight((value, key) => ({ [key]: value }), value);
    await this.updateConfig(updates as Partial<IConfig>, updatedBy);
  }

  /**
   * Seed initial configuration from environment variables
   */
  async seedFromEnv(): Promise<void> {
    try {
      // Ensure DB connection
      if (!db.isConnectedToDatabase()) {
        await db.connect();
      }
      
      // Check if config already exists
      const existingConfig = await Config.findOne();
      if (existingConfig) {
        logger.info('Configuration already exists, skipping seed');
        return;
      }

      const config: Partial<IConfig> = {
        llmProviders: {
          openai: {
            enabled: true,
            apiKey: process.env.OPENAI_API_KEY || '',
            model: process.env.OPENAI_MODEL || 'gpt-4-turbo'
          },
          claude: {
            enabled: true,
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: process.env.CLAUDE_MODEL || 'claude-3-opus'
          },
          gemini: {
            enabled: !!process.env.GEMINI_API_KEY,
            apiKey: process.env.GEMINI_API_KEY || '',
            model: process.env.GEMINI_MODEL || 'gemini-pro'
          },
          grok: {
            enabled: !!process.env.GROK_API_KEY,
            apiKey: process.env.GROK_API_KEY || '',
            model: process.env.GROK_MODEL || 'grok-1'
          },
          groq: {
            enabled: !!process.env.GROQ_API_KEY,
            apiKey: process.env.GROQ_API_KEY || '',
            model: process.env.GROQ_MODEL || 'llama2-70b'
          }
        },
        audio: {
          elevenLabsEnabled: true,
          elevenLabsApiKey: process.env.ELEVEN_API_KEY || '',
          voiceId: process.env.ELEVEN_VOICE_ID || 'Au8OOcCmvsCaQpmULvvQ',
          playbackDevice: 'default',
          volume: 80
        },
        monitoring: {
          discordEnabled: !!process.env.DISCORD_TOKEN,
          twitchEnabled: !!process.env.TWITCH_OAUTH,
          socialEnabled: false,
          eventMonitorEnabled: true,
          discordToken: process.env.DISCORD_TOKEN,
          discordGuildId: process.env.DISCORD_GUILD,
          twitchUsername: process.env.TWITCH_USERNAME,
          twitchOAuth: process.env.TWITCH_OAUTH
        },
        ports: {
          orchestrator: parseInt(process.env.ORCHESTRATOR_PORT || '8742'),
          dashboard: parseInt(process.env.DASHBOARD_PORT || '3000'),
          dashboardServer: parseInt(process.env.DASHBOARD_SERVER_PORT || '3001'),
          memoryServer: parseInt(process.env.MEMORY_SERVER_PORT || '8744'),
          elevenlabs: parseInt(process.env.ELEVENLABS_PORT || '8745'),
          discordTools: parseInt(process.env.DISCORD_TOOLS_PORT || '8746'),
          playwrightSSE: parseInt(process.env.PLAYWRIGHT_SSE_PORT || '8747')
        },
        urls: {
          orchestrator: process.env.ORCHESTRATOR_URL || 'http://localhost:8742',
          dashboard: process.env.DASHBOARD_URL || 'http://localhost:3000',
          dashboardServer: process.env.DASHBOARD_SERVER_URL || 'http://localhost:3001',
          memoryServer: process.env.MEMORY_SERVER_URL || 'http://localhost:8744',
          elevenlabs: process.env.ELEVENLABS_URL || 'http://localhost:8745',
          discordTools: process.env.DISCORD_TOOLS_URL || 'http://localhost:8746',
          playwrightSSE: process.env.PLAYWRIGHT_SSE_URL || 'http://localhost:8747'
        },
        security: {
          apiKeys: (process.env.API_KEYS || '').split(',').filter(Boolean),
          allowedOrigins: (process.env.ALLOWED_ORIGINS || '*').split(','),
          rateLimit: {
            windowMs: 60000,
            maxRequests: 100
          }
        },
        updatedBy: 'system'
      };

      // Create initial config
      const newConfig = new Config(config);
      await newConfig.save();

      logger.info('✅ Initial configuration seeded from environment variables');

    } catch (error) {
      logger.error('Failed to seed configuration:', error);
      throw error;
    }
  }
}

export const configService = ConfigService.getInstance();