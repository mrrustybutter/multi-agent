/**
 * Queue Manager
 * Handles message queuing between agents
 */

import { promises as fs } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

export interface QueueMessage {
  id: string;
  timestamp: string;
  source: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  action: {
    type: string;
    content?: string;
    data?: any;
  };
  context?: any;
  ttl?: number; // Time to live in seconds
}

export class QueueManager extends EventEmitter {
  private queueDir: string;
  private watcher?: chokidar.FSWatcher;
  private messages: Map<string, QueueMessage> = new Map();

  constructor(queueDir: string) {
    super();
    this.queueDir = queueDir;
  }

  async initialize(): Promise<void> {
    // Ensure queue directory exists
    await fs.mkdir(this.queueDir, { recursive: true });

    // Watch for new queue files in all subdirectories
    const watchPattern = path.join(this.queueDir, '**/*.json');
    console.log(`🔍 QueueManager watching pattern: ${watchPattern}`);
    this.watcher = chokidar.watch(watchPattern, {
      persistent: true,
      ignoreInitial: false
    });

    this.watcher.on('add', this.handleNewFile.bind(this));
    this.watcher.on('change', this.handleFileChange.bind(this));
    
    logger.info(`Queue manager initialized, watching: ${this.queueDir}`);
  }

  private async handleNewFile(filePath: string): Promise<void> {
    console.log(`🔍 QueueManager detected file: ${filePath}`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const message = JSON.parse(content) as QueueMessage;
      
      this.messages.set(message.id, message);
      this.emit('message', message);
      
      console.log(`📢 Emitting message event: ${message.id} from ${message.source}`);
      logger.info(`New queue message: ${message.id} from ${message.source}`);
    } catch (error) {
      console.log(`❌ Error processing queue file ${filePath}:`, error);
      logger.error(`Error reading queue file ${filePath}:`, error);
    }
  }

  private async handleFileChange(filePath: string): Promise<void> {
    await this.handleNewFile(filePath);
  }

  async writeMessage(message: QueueMessage): Promise<void> {
    const filename = `${message.source}-${message.id}.json`;
    const filePath = path.join(this.queueDir, filename);
    
    await fs.writeFile(filePath, JSON.stringify(message, null, 2));
    logger.info(`Wrote queue message: ${message.id}`);
  }

  async deleteMessage(messageId: string): Promise<void> {
    console.log(`🗑️ Attempting to delete message: ${messageId}`);
    
    // Search recursively for the file in subdirectories
    const findAndDeleteFile = async (dir: string): Promise<boolean> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // Recursively search subdirectory
            if (await findAndDeleteFile(fullPath)) {
              return true;
            }
          } else if (entry.isFile() && entry.name.includes(messageId)) {
            // Found the file, delete it
            await fs.unlink(fullPath);
            this.messages.delete(messageId);
            console.log(`🗑️ Deleted queue file: ${fullPath}`);
            logger.info(`Deleted queue message: ${messageId}`);
            return true;
          }
        }
      } catch (error) {
        console.log(`❌ Error searching directory ${dir}:`, error);
      }
      return false;
    };
    
    const deleted = await findAndDeleteFile(this.queueDir);
    if (!deleted) {
      console.log(`⚠️ Could not find file for message: ${messageId}`);
    }
  }

  getMessagesByPriority(priority?: string): QueueMessage[] {
    const messages = Array.from(this.messages.values());
    
    if (priority) {
      return messages.filter(m => m.priority === priority);
    }
    
    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return messages.sort((a, b) => 
      priorityOrder[a.priority] - priorityOrder[b.priority]
    );
  }

  async cleanExpiredMessages(): Promise<void> {
    const now = Date.now();
    
    for (const [id, message] of this.messages) {
      if (message.ttl) {
        const messageTime = new Date(message.timestamp).getTime();
        const expiryTime = messageTime + (message.ttl * 1000);
        
        if (now > expiryTime) {
          await this.deleteMessage(id);
        }
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
    }
  }
}