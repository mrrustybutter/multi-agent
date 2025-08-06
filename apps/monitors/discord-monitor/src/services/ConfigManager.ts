import { getMonitorConfig, watchConfig } from '@rusty-butter/shared';
import winston from 'winston';
import { EventEmitter } from 'events';

export interface DiscordMonitorConfig {
  token: string;
  defaultGuild?: string;
  messageHistoryLimit: number;
  spawnCooldown: number;
  minMessageLength: number;
  orchestratorUrl: string;
  forwardingEnabled: boolean;
}

export class ConfigManager extends EventEmitter {
  private config: DiscordMonitorConfig;
  private logger: winston.Logger;
  private configWatcher?: () => void;

  constructor() {
    super();
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'config-manager' },
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });

    // Default configuration
    this.config = {
      token: process.env.DISCORD_TOKEN || '',
      defaultGuild: process.env.DISCORD_GUILD,
      messageHistoryLimit: 100,
      spawnCooldown: 2000,
      minMessageLength: 3,
      orchestratorUrl: process.env.ORCHESTRATOR_URL || 'http://localhost:8742',
      forwardingEnabled: true
    };
  }

  async initialize(): Promise<void> {
    try {
      // Try to load config from MongoDB
      const dbConfig = await getMonitorConfig('discord');
      
      if (dbConfig) {
        this.config = {
          token: dbConfig.token || this.config.token,
          defaultGuild: dbConfig.defaultGuild || this.config.defaultGuild,
          messageHistoryLimit: dbConfig.messageHistoryLimit || this.config.messageHistoryLimit,
          spawnCooldown: dbConfig.spawnCooldown || this.config.spawnCooldown,
          minMessageLength: dbConfig.minMessageLength || this.config.minMessageLength,
          orchestratorUrl: dbConfig.orchestratorUrl || this.config.orchestratorUrl,
          forwardingEnabled: dbConfig.forwardingEnabled !== undefined 
            ? dbConfig.forwardingEnabled 
            : this.config.forwardingEnabled
        };
        
        this.logger.info('Loaded configuration from MongoDB');
      } else {
        this.logger.info('Using environment/default configuration');
      }

      // Set up config watching
      this.configWatcher = watchConfig('discord', (newConfig) => {
        this.handleConfigUpdate(newConfig);
      });

    } catch (error) {
      this.logger.warn('Failed to load config from MongoDB, using environment variables:', error);
    }
  }

  private handleConfigUpdate(newConfig: any): void {
    const oldConfig = { ...this.config };
    
    // Update config
    this.config = {
      token: newConfig.token || this.config.token,
      defaultGuild: newConfig.defaultGuild || this.config.defaultGuild,
      messageHistoryLimit: newConfig.messageHistoryLimit || this.config.messageHistoryLimit,
      spawnCooldown: newConfig.spawnCooldown || this.config.spawnCooldown,
      minMessageLength: newConfig.minMessageLength || this.config.minMessageLength,
      orchestratorUrl: newConfig.orchestratorUrl || this.config.orchestratorUrl,
      forwardingEnabled: newConfig.forwardingEnabled !== undefined 
        ? newConfig.forwardingEnabled 
        : this.config.forwardingEnabled
    };

    this.logger.info('Configuration updated');
    
    // Emit update event with changes
    this.emit('configUpdated', this.config, oldConfig);
  }

  getConfig(): DiscordMonitorConfig {
    return { ...this.config };
  }

  getBotConfig() {
    return {
      token: this.config.token,
      defaultGuild: this.config.defaultGuild,
      messageHistoryLimit: this.config.messageHistoryLimit,
      minMessageLength: this.config.minMessageLength
    };
  }

  getForwarderConfig() {
    return {
      orchestratorUrl: this.config.orchestratorUrl,
      spawnCooldown: this.config.spawnCooldown,
      enabled: this.config.forwardingEnabled
    };
  }

  stop(): void {
    if (this.configWatcher) {
      this.configWatcher();
      this.configWatcher = undefined;
    }
  }
}