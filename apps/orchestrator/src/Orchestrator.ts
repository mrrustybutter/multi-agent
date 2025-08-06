import express, { Express } from 'express';
import cors from 'cors';
import { Server } from 'http';
import { getLogger } from '@rusty-butter/logger';
import { getConfig, getLLMRouting } from './config';
import { ClaudeManager } from './services/ClaudeManager';
import { EventProcessor } from './services/EventProcessor';
import { createEventsRouter } from './routes/events';
import { createStatusRouter } from './routes/status';
import { createClaudeRouter } from './routes/claude';
import { createAdminRouter } from './routes/admin';
import memoryRouter from './routes/memory';
import activityRouter from './routes/activity';
import configRouter from './routes/config';
import { loggingMiddleware } from './middleware/logging';
import { errorHandler } from './middleware/errorHandler';
import { db, configService } from '@rusty-butter/shared';
import rateLimit from 'express-rate-limit';

const logger = getLogger('orchestrator');

export class Orchestrator {
  private app: Express;
  private server?: Server;
  private claudeManager: ClaudeManager;
  private eventProcessor: EventProcessor;
  private cleanupInterval?: NodeJS.Timeout;
  private config: any;
  private llmRouting: any;

  constructor() {
    this.app = express();
    this.claudeManager = new ClaudeManager();
    this.eventProcessor = new EventProcessor(this.claudeManager);
  }

  async initialize() {
    try {
      // Connect to MongoDB
      await db.connect();
      
      // Load configuration from MongoDB
      const fullConfig = await configService.getConfig();
      const baseConfig = await getConfig();
      this.config = {
        ...baseConfig,
        security: fullConfig.security || {
          apiKeys: [],
          allowedOrigins: ['*'],
          rateLimit: {
            windowMs: 60000,
            maxRequests: 100
          }
        },
        performance: fullConfig.performance || {
          maxConcurrency: 5,
          timeout: 300000,
          retryAttempts: 3
        }
      };
      this.llmRouting = await getLLMRouting();
      
      // Initialize event processor
      await this.eventProcessor.initialize();
      
      // Initialize services
      this.setupMiddleware();
      this.setupRoutes();
      this.setupEventListeners();
    } catch (error) {
      logger.error('Failed to initialize orchestrator:', error);
      throw error;
    }
  }

  private setupMiddleware() {
    // Configure CORS - Always allow dashboard access
    const allowedOrigins = [
      'http://localhost:3000',  // Dashboard
      'http://127.0.0.1:3000',  // Dashboard alternative
      ...(Array.isArray(this.config.security?.allowedOrigins) ? this.config.security.allowedOrigins : ['*'])
    ];
    
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, Postman, curl)
        if (!origin) return callback(null, true);
        
        // Check if origin is in allowed list or if '*' is configured
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        // Allow localhost variants for development
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    
    // Add API key validation
    this.app.use((req, res, next) => {
      const apiKey = req.headers['x-api-key'];
      if (this.config.security.apiKeys.length > 0 && 
          !this.config.security.apiKeys.includes(apiKey)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      next();
    });

    // Rate limiting
    const rateLimiter = rateLimit({
      windowMs: this.config.security.rateLimit.windowMs,
      max: this.config.security.rateLimit.maxRequests
    });
    this.app.use(rateLimiter);

    // Request logging
    this.app.use(loggingMiddleware);
  }

  private setupRoutes() {
    // API routes
    this.app.use('/api', createEventsRouter(this.eventProcessor));
    this.app.use('/api', createStatusRouter(this.eventProcessor, this.claudeManager));
    this.app.use('/api', createClaudeRouter(this.claudeManager));
    this.app.use('/api', createAdminRouter(this.claudeManager));
    this.app.use('/api', configRouter);
    this.app.use('/api/memory', memoryRouter);
    this.app.use('/api/activity', activityRouter);
    
    // Legacy routes (for backwards compatibility)
    this.app.use('/', createEventsRouter(this.eventProcessor));
    this.app.use('/', createStatusRouter(this.eventProcessor, this.claudeManager));
    this.app.use('/', createClaudeRouter(this.claudeManager));
    this.app.use('/', createAdminRouter(this.claudeManager));
    this.app.use('/memory', memoryRouter);
    this.app.use('/activity', activityRouter);
    
    // Error handler (must be last)
    this.app.use(errorHandler);
  }

  private setupEventListeners() {
    // Listen to Claude manager events
    this.claudeManager.on('claude-exited', (data) => {
      logger.info(`Claude ${data.id} exited for event ${data.eventId} after ${data.duration}ms`);
    });

    // Listen to event processor events
    this.eventProcessor.on('event-processed', (data) => {
      logger.info(`Event processed: ${data.eventId} with main instance ${data.mainInstanceId}`);
    });

    this.eventProcessor.on('event-failed', (data) => {
      logger.error(`Event failed: ${data.eventId}`, data.error.message);
    });
  }

  async start(): Promise<void> {
    try {
      logger.info('Initializing orchestrator API server...');
      
      // Initialize services
      await this.initialize();
      
      // Start Express server
      this.server = this.app.listen(this.config.port, () => {
        logger.info(`Orchestrator API server listening on port ${this.config.port}`);
      });

      // Start cleanup interval
      this.cleanupInterval = setInterval(() => {
        this.claudeManager.cleanup();
        const active = this.claudeManager.getActiveClaudes();
        logger.debug(`Active Claude instances after cleanup: ${active.length}`);
      }, this.config.performance.timeout / 4); // Clean up at 1/4 of timeout interval

      // Start status reporting
      this.startStatusReporting();
      
      logger.info('Orchestrator initialized successfully');
      
    } catch (error) {
      logger.error('Failed to start orchestrator:', error);
      throw error;
    }
  }

  private startStatusReporting() {
    setInterval(() => {
      const status = this.eventProcessor.getStatus();
      const activeClaudes = this.claudeManager.getActiveClaudes();
      
      logger.debug('System status:', {
        activeClaudes: activeClaudes.length,
        queueSize: status.queueSize,
        queuePending: status.queuePending,
        eventHistory: status.eventHistory
      });
    }, 30000); // Report every 30 seconds
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down orchestrator...');
    
    // Clear intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Close server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
    }
    
    logger.info('Orchestrator shutdown complete');
  }
}