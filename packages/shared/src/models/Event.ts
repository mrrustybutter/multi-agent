import { Schema, model, Document } from 'mongoose';

export interface IEvent extends Document {
  type: string;
  source: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  user?: string;
  message?: string;
  data?: any; // Original event data
  response?: any; // Response from Claude instance
  duration?: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  completedAt?: Date;
  metadata: {
    llmProvider?: string;
    llmModel?: string;
    tokenCount?: number;
    promptTokens?: number;
    completionTokens?: number;
    memoryBankAccessed?: string[];
    audioGenerated?: boolean;
    claudeInstanceId?: string;
    [key: string]: any;
  };
  correlationId?: string;
  parentEventId?: string;
  childEvents?: string[];
  memoryIds?: string[];
}

const EventSchema = new Schema<IEvent>({
  type: { type: String, required: true, index: true },
  source: { type: String, required: true, index: true },
  priority: { 
    type: String, 
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    index: true
  },
  timestamp: { type: Date, default: Date.now, index: true },
  user: { type: String, sparse: true },
  message: String,
  data: Schema.Types.Mixed, // Original event data
  response: Schema.Types.Mixed, // Response from Claude instance
  duration: Number,
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'error'],
    index: true
  },
  error: String,
  completedAt: Date,
  metadata: {
    llmProvider: String,
    llmModel: String,
    tokenCount: Number,
    promptTokens: Number,
    completionTokens: Number,
    memoryBankAccessed: [String],
    audioGenerated: Boolean,
    claudeInstanceId: String,
    type: Map,
    of: Schema.Types.Mixed
  },
  correlationId: { type: String, sparse: true },
  parentEventId: { type: String, sparse: true },
  childEvents: [String],
  memoryIds: [String]
}, {
  timestamps: true
});

// Compound indexes for common queries
EventSchema.index({ timestamp: -1, type: 1 });
EventSchema.index({ timestamp: -1, source: 1 });
EventSchema.index({ timestamp: -1, status: 1 });
EventSchema.index({ correlationId: 1, timestamp: -1 });

export const Event = model<IEvent>('Event', EventSchema);