import { Client, GatewayIntentBits, Message, VoiceChannel, TextChannel, Guild } from 'discord.js';
import { joinVoiceChannel, VoiceConnection, getVoiceConnection } from '@discordjs/voice';
import winston from 'winston';
import { EventEmitter } from 'events';

export interface DiscordMessage {
  id: string;
  timestamp: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
    bot: boolean;
  };
  content: string;
  channelId: string;
  channelName: string;
  guildId: string;
  guildName: string;
}

export interface BotConfig {
  token: string;
  defaultGuild?: string;
  messageHistoryLimit: number;
  minMessageLength: number;
}

export class DiscordBot extends EventEmitter {
  private client: Client | null = null;
  private voiceConnection: VoiceConnection | null = null;
  private messageHistory: DiscordMessage[] = [];
  private isConnected = false;
  private logger: winston.Logger;

  constructor(private config: BotConfig) {
    super();
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'discord-bot' },
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }

  async connect(): Promise<void> {
    if (!this.config.token) {
      throw new Error('Discord token not configured');
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
      ]
    });

    this.setupEventHandlers();

    await this.client.login(this.config.token);
    this.logger.info('Discord bot connected');
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('ready', () => {
      this.isConnected = true;
      this.logger.info(`Discord bot logged in as ${this.client?.user?.tag}`);
      this.emit('ready', this.client?.user);
    });

    this.client.on('messageCreate', (message: Message) => {
      if (message.author.bot) return;
      if (message.content.length < this.config.minMessageLength) return;

      const discordMessage = this.messageToDiscordMessage(message);
      this.addToHistory(discordMessage);
      this.emit('message', discordMessage);
    });

    this.client.on('error', (error) => {
      this.logger.error('Discord client error:', error);
      this.emit('error', error);
    });

    this.client.on('disconnect', () => {
      this.isConnected = false;
      this.logger.info('Discord bot disconnected');
      this.emit('disconnect');
    });
  }

  private messageToDiscordMessage(message: Message): DiscordMessage {
    return {
      id: message.id,
      timestamp: message.createdAt.toISOString(),
      author: {
        id: message.author.id,
        username: message.author.username,
        discriminator: message.author.discriminator || '0000',
        bot: message.author.bot
      },
      content: message.content,
      channelId: message.channelId,
      channelName: (message.channel as TextChannel)?.name || 'unknown',
      guildId: message.guildId || '',
      guildName: message.guild?.name || 'Direct Message'
    };
  }

  private addToHistory(message: DiscordMessage): void {
    this.messageHistory.push(message);
    
    // Trim history if needed
    if (this.messageHistory.length > this.config.messageHistoryLimit) {
      this.messageHistory.shift();
    }
  }

  async sendMessage(channelId: string, content: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new Error('Discord bot not connected');
    }

    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${channelId} not found or not text-based`);
    }

    await (channel as TextChannel).send(content);
    this.logger.info(`Sent message to channel ${channelId}`);
  }

  async joinVoiceChannel(channelId: string, guildId?: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new Error('Discord bot not connected');
    }

    // Use provided guildId or try to get from default guild
    const guild = guildId 
      ? this.client.guilds.cache.get(guildId)
      : this.client.guilds.cache.get(this.config.defaultGuild || '');

    if (!guild) {
      throw new Error('Guild not found');
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !(channel instanceof VoiceChannel)) {
      throw new Error(`Voice channel ${channelId} not found`);
    }

    this.voiceConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator
    });

    this.logger.info(`Joined voice channel ${channel.name}`);
  }

  async leaveVoiceChannel(guildId?: string): Promise<void> {
    const targetGuildId = guildId || this.config.defaultGuild;
    if (!targetGuildId) {
      throw new Error('No guild ID provided');
    }

    const connection = getVoiceConnection(targetGuildId);
    if (connection) {
      connection.destroy();
      this.voiceConnection = null;
      this.logger.info('Left voice channel');
    }
  }

  async listChannels(guildId?: string): Promise<Array<{ id: string; name: string; type: string }>> {
    if (!this.client || !this.isConnected) {
      throw new Error('Discord bot not connected');
    }

    const targetGuildId = guildId || this.config.defaultGuild;
    if (!targetGuildId) {
      throw new Error('No guild ID provided');
    }

    const guild = this.client.guilds.cache.get(targetGuildId);
    if (!guild) {
      throw new Error(`Guild ${targetGuildId} not found`);
    }

    return guild.channels.cache.map(channel => ({
      id: channel.id,
      name: channel.name,
      type: channel.type.toString()
    }));
  }

  getMessageHistory(): DiscordMessage[] {
    return [...this.messageHistory];
  }

  getStatus(): {
    connected: boolean;
    username?: string;
    guilds: number;
    voiceConnected: boolean;
  } {
    return {
      connected: this.isConnected,
      username: this.client?.user?.username,
      guilds: this.client?.guilds.cache.size || 0,
      voiceConnected: this.voiceConnection !== null
    };
  }

  async disconnect(): Promise<void> {
    if (this.voiceConnection) {
      this.voiceConnection.destroy();
      this.voiceConnection = null;
    }

    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }

    this.isConnected = false;
    this.logger.info('Discord bot disconnected');
  }
}