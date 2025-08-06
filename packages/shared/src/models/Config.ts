import { Schema, model, Document } from 'mongoose';

export interface IConfig extends Document {
  llmProviders: {
    openai: { enabled: boolean; apiKey: string; model: string };
    claude: { enabled: boolean; apiKey: string; model: string };
    gemini: { enabled: boolean; apiKey: string; model: string };
    grok: { enabled: boolean; apiKey: string; model: string };
    groq: { enabled: boolean; apiKey: string; model: string };
  };
  audio: {
    elevenLabsEnabled: boolean;
    elevenLabsApiKey: string;
    voiceId: string;
    playbackDevice: string;
    volume: number;
  };
  memory: {
    enabled: boolean;
    autoStore: boolean;
    retentionDays: number;
    maxMemoriesPerBank: number;
  };
  monitoring: {
    discordEnabled: boolean;
    twitchEnabled: boolean;
    socialEnabled: boolean;
    eventMonitorEnabled: boolean;
    discordToken?: string;
    discordGuildId?: string;
    twitchUsername?: string;
    twitchOAuth?: string;
  };
  performance: {
    maxConcurrency: number;
    queueSize: number;
    timeout: number;
    retryAttempts: number;
  };
  notifications: {
    errors: boolean;
    warnings: boolean;
    info: boolean;
    sound: boolean;
  };
  ports: {
    orchestrator: number;
    dashboard: number;
    dashboardServer: number;
    memoryServer: number;
    elevenlabs: number;
    discordTools: number;
    playwrightSSE: number;
  };
  urls: {
    orchestrator: string;
    dashboard: string;
    dashboardServer: string;
    memoryServer: string;
    elevenlabs: string;
    discordTools: string;
    playwrightSSE: string;
  };
  security: {
    apiKeys: string[];
    allowedOrigins: string[];
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
  };
  updatedAt: Date;
  updatedBy: string;
}

const ConfigSchema = new Schema<IConfig>({
  llmProviders: {
    openai: {
      enabled: { type: Boolean, default: false },
      apiKey: { type: String, default: '' }, // Optional - only needed if OpenAI is enabled
      model: { type: String, default: 'gpt-4-turbo' }
    },
    claude: {
      enabled: { type: Boolean, default: true }, // Default to true since Claude Code is installed
      apiKey: { type: String, default: '' }, // Not required - Claude Code handles authentication
      model: { type: String, default: 'claude-3-opus' }
    },
    gemini: {
      enabled: { type: Boolean, default: false },
      apiKey: { type: String },
      model: { type: String, default: 'gemini-pro' }
    },
    grok: {
      enabled: { type: Boolean, default: false },
      apiKey: { type: String },
      model: { type: String, default: 'grok-1' }
    },
    groq: {
      enabled: { type: Boolean, default: false },
      apiKey: { type: String },
      model: { type: String, default: 'llama2-70b' }
    }
  },
  audio: {
    elevenLabsEnabled: { type: Boolean, default: false },
    elevenLabsApiKey: { type: String, default: '' }, // Optional - only needed if ElevenLabs is enabled
    voiceId: { type: String, default: 'Au8OOcCmvsCaQpmULvvQ' },
    playbackDevice: { type: String, default: 'default' },
    volume: { type: Number, default: 80, min: 0, max: 100 }
  },
  memory: {
    enabled: { type: Boolean, default: true },
    autoStore: { type: Boolean, default: true },
    retentionDays: { type: Number, default: 30, min: 1 },
    maxMemoriesPerBank: { type: Number, default: 10000, min: 100 }
  },
  monitoring: {
    discordEnabled: { type: Boolean, default: false },
    twitchEnabled: { type: Boolean, default: false },
    socialEnabled: { type: Boolean, default: false },
    eventMonitorEnabled: { type: Boolean, default: true },
    discordToken: String,
    discordGuildId: String,
    twitchUsername: String,
    twitchOAuth: String
  },
  performance: {
    maxConcurrency: { type: Number, default: 5, min: 1 },
    queueSize: { type: Number, default: 100, min: 10 },
    timeout: { type: Number, default: 30000, min: 1000 },
    retryAttempts: { type: Number, default: 3, min: 0 }
  },
  notifications: {
    errors: { type: Boolean, default: true },
    warnings: { type: Boolean, default: true },
    info: { type: Boolean, default: false },
    sound: { type: Boolean, default: true }
  },
  ports: {
    orchestrator: { type: Number, required: true },
    dashboard: { type: Number, required: true },
    dashboardServer: { type: Number, required: true },
    memoryServer: { type: Number, required: true },
    elevenlabs: { type: Number, required: true },
    discordTools: { type: Number, required: true },
    playwrightSSE: { type: Number, required: true }
  },
  urls: {
    orchestrator: { type: String, required: true },
    dashboard: { type: String, required: true },
    dashboardServer: { type: String, required: true },
    memoryServer: { type: String, required: true },
    elevenlabs: { type: String, required: true },
    discordTools: { type: String, required: true },
    playwrightSSE: { type: String, required: true }
  },
  security: {
    apiKeys: [{ type: String }],
    allowedOrigins: [{ type: String }],
    rateLimit: {
      windowMs: { type: Number, default: 60000 },
      maxRequests: { type: Number, default: 100 }
    }
  },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, required: true }
}, {
  timestamps: true
});

// Add index for fast config retrieval
ConfigSchema.index({ updatedAt: -1 });

// Middleware to update the updatedAt timestamp
ConfigSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const Config = model<IConfig>('Config', ConfigSchema);