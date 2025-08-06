import mongoose from 'mongoose';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('database-service');

class DatabaseService {
  private static instance: DatabaseService;
  private isConnected = false;

  private constructor() {}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      // Get MongoDB URL from environment or use default with authentication
      const mongoUrl = process.env.MONGODB_URL || 'mongodb://rusty:butter@localhost:27017/rusty-butter';
      
      await mongoose.connect(mongoUrl, {
        autoIndex: true,
      });

      this.isConnected = true;
      logger.info('✅ Connected to MongoDB');

      // Handle connection events
      mongoose.connection.on('error', (error) => {
        logger.error('MongoDB connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
        this.isConnected = true;
      });

    } catch (error) {
      logger.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      logger.info('Disconnected from MongoDB');
    } catch (error) {
      logger.error('Failed to disconnect from MongoDB:', error);
      throw error;
    }
  }

  isConnectedToDatabase(): boolean {
    return this.isConnected;
  }
}

export const db = DatabaseService.getInstance();