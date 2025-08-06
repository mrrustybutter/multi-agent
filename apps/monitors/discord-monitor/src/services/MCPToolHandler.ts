import winston from 'winston';
import { DiscordBot } from './DiscordBot';

export interface ToolResult {
  content: Array<{ type: string; text?: string; data?: any }>;
}

export class MCPToolHandler {
  private logger: winston.Logger;

  constructor(private bot: DiscordBot) {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'mcp-tool-handler' },
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }

  async handleSendMessage(args: any): Promise<ToolResult> {
    const { channelId, content } = args;
    
    if (!channelId || !content) {
      throw new Error('channelId and content are required');
    }

    await this.bot.sendMessage(channelId, content);
    
    return {
      content: [{
        type: 'text',
        text: `Message sent to channel ${channelId}`
      }]
    };
  }

  async handleJoinVoice(args: any): Promise<ToolResult> {
    const { channelId, guildId } = args;
    
    if (!channelId) {
      throw new Error('channelId is required');
    }

    await this.bot.joinVoiceChannel(channelId, guildId);
    
    return {
      content: [{
        type: 'text',
        text: `Joined voice channel ${channelId}`
      }]
    };
  }

  async handleLeaveVoice(args: any): Promise<ToolResult> {
    const { guildId } = args;
    
    await this.bot.leaveVoiceChannel(guildId);
    
    return {
      content: [{
        type: 'text',
        text: 'Left voice channel'
      }]
    };
  }

  async handleGetMessages(): Promise<ToolResult> {
    const messages = this.bot.getMessageHistory();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(messages, null, 2)
      }]
    };
  }

  async handleListChannels(args: any): Promise<ToolResult> {
    const { guildId } = args;
    
    const channels = await this.bot.listChannels(guildId);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(channels, null, 2)
      }]
    };
  }

  async handleGetStatus(): Promise<ToolResult> {
    const status = this.bot.getStatus();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(status, null, 2)
      }]
    };
  }
}