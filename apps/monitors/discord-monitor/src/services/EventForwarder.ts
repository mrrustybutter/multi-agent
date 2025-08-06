import { spawn } from 'child_process';
import winston from 'winston';
import { DiscordMessage } from './DiscordBot';

export interface ForwardConfig {
  orchestratorUrl: string;
  spawnCooldown: number;
  enabled: boolean;
}

export class EventForwarder {
  private lastSpawnTime = 0;
  private logger: winston.Logger;

  constructor(private config: ForwardConfig) {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'event-forwarder' },
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }

  updateConfig(config: Partial<ForwardConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async forwardMessage(message: DiscordMessage): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('Event forwarding disabled');
      return;
    }

    // Apply spawn cooldown
    const now = Date.now();
    if (now - this.lastSpawnTime < this.config.spawnCooldown) {
      this.logger.debug(`Skipping spawn due to cooldown (${this.config.spawnCooldown}ms)`);
      return;
    }

    try {
      await this.sendToOrchestrator(message);
      this.lastSpawnTime = now;
    } catch (error) {
      this.logger.error('Failed to forward message to orchestrator:', error);
    }
  }

  private async sendToOrchestrator(message: DiscordMessage): Promise<void> {
    const event = {
      source: 'discord',
      type: 'chat_message',
      priority: this.determinePriority(message),
      data: {
        message: message.content,
        user: message.author.username,
        userId: message.author.id,
        channel: message.channelName,
        channelId: message.channelId,
        guild: message.guildName,
        guildId: message.guildId,
        timestamp: message.timestamp
      },
      timestamp: new Date().toISOString()
    };

    // Send to orchestrator API
    const response = await fetch(`${this.config.orchestratorUrl}/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    if (!response.ok) {
      throw new Error(`Orchestrator returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    this.logger.info(`Event forwarded to orchestrator: ${result.eventId}`);
  }

  private determinePriority(message: DiscordMessage): 'low' | 'medium' | 'high' | 'critical' {
    // Mentions or important keywords get higher priority
    const content = message.content.toLowerCase();
    
    if (content.includes('@everyone') || content.includes('@here')) {
      return 'high';
    }
    
    if (content.includes('urgent') || content.includes('emergency') || content.includes('help')) {
      return 'high';
    }
    
    if (content.includes('bug') || content.includes('error') || content.includes('issue')) {
      return 'medium';
    }
    
    // Direct messages get medium priority
    if (!message.guildId) {
      return 'medium';
    }
    
    return 'low';
  }

  async spawnClaude(message: DiscordMessage): Promise<void> {
    // Legacy method - spawn Claude directly
    const now = Date.now();
    if (now - this.lastSpawnTime < this.config.spawnCooldown) {
      this.logger.debug('Skipping Claude spawn due to cooldown');
      return;
    }

    const prompt = this.buildClaudePrompt(message);
    
    const claudeProcess = spawn('claude', ['-p', prompt], {
      env: {
        ...process.env,
        DISCORD_MESSAGE_ID: message.id,
        DISCORD_CHANNEL_ID: message.channelId,
        DISCORD_GUILD_ID: message.guildId,
        DISCORD_USER_ID: message.author.id
      }
    });

    this.lastSpawnTime = now;

    claudeProcess.on('exit', (code) => {
      this.logger.info(`Claude process exited with code ${code}`);
    });

    claudeProcess.on('error', (error) => {
      this.logger.error('Failed to spawn Claude:', error);
    });
  }

  private buildClaudePrompt(message: DiscordMessage): string {
    return `You received a Discord message:
User: ${message.author.username}
Channel: ${message.channelName}
Server: ${message.guildName}
Message: ${message.content}

Respond appropriately to this message. You can use Discord tools to send messages or join voice channels.`;
  }

  getStats(): { lastSpawnTime: number; enabled: boolean } {
    return {
      lastSpawnTime: this.lastSpawnTime,
      enabled: this.config.enabled
    };
  }
}