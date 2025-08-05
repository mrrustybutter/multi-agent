/**
 * @rusty-butter/logger
 * Centralized logging system for multi-agent architecture
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import chalk from 'chalk';
import path from 'path';

// Custom log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    agent: 3,
    mcp: 4,
    chat: 5,
    debug: 6
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    agent: 'cyan',
    mcp: 'magenta',
    chat: 'blue',
    debug: 'gray'
  }
};

// Add colors to winston
winston.addColors(customLevels.colors);

// Custom format for console output
const consoleFormat = winston.format.printf(({ timestamp, level, service, message, ...meta }) => {
  const coloredLevel = winston.format.colorize().colorize(level, level.toUpperCase());
  const serviceName = service ? chalk.gray(`[${service}]`) : '';
  
  let output = `${chalk.gray(timestamp)} ${coloredLevel} ${serviceName} ${message}`;
  
  // Add metadata if present
  if (Object.keys(meta).length > 0) {
    output += chalk.gray(` ${JSON.stringify(meta)}`);
  }
  
  return output;
});

// Create logger instance
export function createLogger(service: string, options: Partial<LoggerOptions> = {}) {
  const {
    logDir = path.join(process.cwd(), 'logs'),
    consoleLevel = 'info',
    fileLevel = 'debug',
    enableConsole = true,
    enableFile = true,
    enableRotation = true
  } = options;

  const transports: winston.transport[] = [];

  // Console transport
  if (enableConsole) {
    transports.push(
      new winston.transports.Console({
        level: consoleLevel,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          consoleFormat
        )
      })
    );
  }

  // File transport with rotation
  if (enableFile) {
    if (enableRotation) {
      transports.push(
        new DailyRotateFile({
          level: fileLevel,
          filename: path.join(logDir, `${service.replace(/:/g, '-')}-%DATE%.log`),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      );
    } else {
      transports.push(
        new winston.transports.File({
          level: fileLevel,
          filename: path.join(logDir, `${service.replace(/:/g, '-')}.log`),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      );
    }

    // Error file
    transports.push(
      new winston.transports.File({
        level: 'error',
        filename: path.join(logDir, `${service}-error.log`),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      })
    );
  }

  return winston.createLogger({
    levels: customLevels.levels,
    defaultMeta: { service },
    transports
  });
}

// Logger options interface
export interface LoggerOptions {
  logDir: string;
  consoleLevel: string;
  fileLevel: string;
  enableConsole: boolean;
  enableFile: boolean;
  enableRotation: boolean;
}

// Specialized loggers
export class AgentLogger {
  private logger: winston.Logger;

  constructor(agentName: string, options?: Partial<LoggerOptions>) {
    this.logger = createLogger(`agent:${agentName}`, options);
  }

  taskStarted(taskId: string, description: string) {
    this.logger.log('agent', `Task started: ${taskId}`, { taskId, description });
  }

  taskCompleted(taskId: string, duration: number) {
    this.logger.log('agent', `Task completed: ${taskId} (${duration}ms)`, { taskId, duration });
  }

  taskFailed(taskId: string, error: Error) {
    this.logger.error(`Task failed: ${taskId}`, { taskId, error: error.message, stack: error.stack });
  }

  spawned(parentId: string, context: any) {
    this.logger.log('agent', `Agent spawned by ${parentId}`, { parentId, context });
  }
}

export class MCPLogger {
  private logger: winston.Logger;

  constructor(serverName: string, options?: Partial<LoggerOptions>) {
    this.logger = createLogger(`mcp:${serverName}`, options);
  }

  connected(clientInfo: any) {
    this.logger.log('mcp', 'Client connected', clientInfo);
  }

  disconnected(reason?: string) {
    this.logger.log('mcp', 'Client disconnected', { reason });
  }

  toolCalled(toolName: string, args: any) {
    this.logger.log('mcp', `Tool called: ${toolName}`, { tool: toolName, args });
  }

  toolCompleted(toolName: string, duration: number) {
    this.logger.log('mcp', `Tool completed: ${toolName} (${duration}ms)`, { tool: toolName, duration });
  }

  toolError(toolName: string, error: Error) {
    this.logger.error(`Tool error: ${toolName}`, { tool: toolName, error: error.message });
  }
}

export class ChatLogger {
  private logger: winston.Logger;

  constructor(platform: string, options?: Partial<LoggerOptions>) {
    this.logger = createLogger(`chat:${platform}`, options);
  }

  messageReceived(user: string, message: string, metadata?: any) {
    this.logger.log('chat', `[${user}]: ${message}`, { user, ...metadata });
  }

  messageSent(message: string, target?: string) {
    this.logger.log('chat', `Sent: ${message}`, { target });
  }

  userJoined(user: string, metadata?: any) {
    this.logger.log('chat', `User joined: ${user}`, { user, ...metadata });
  }

  userLeft(user: string, metadata?: any) {
    this.logger.log('chat', `User left: ${user}`, { user, ...metadata });
  }
}

// Central logger registry
class LoggerRegistry {
  private loggers: Map<string, winston.Logger> = new Map();
  private defaultOptions: Partial<LoggerOptions>;

  constructor(defaultOptions: Partial<LoggerOptions> = {}) {
    this.defaultOptions = defaultOptions;
  }

  getLogger(service: string): winston.Logger {
    if (!this.loggers.has(service)) {
      this.loggers.set(service, createLogger(service, this.defaultOptions));
    }
    return this.loggers.get(service)!;
  }

  getAgentLogger(agentName: string): AgentLogger {
    return new AgentLogger(agentName, this.defaultOptions);
  }

  getMCPLogger(serverName: string): MCPLogger {
    return new MCPLogger(serverName, this.defaultOptions);
  }

  getChatLogger(platform: string): ChatLogger {
    return new ChatLogger(platform, this.defaultOptions);
  }
}

// Export singleton registry
export const loggerRegistry = new LoggerRegistry({
  logDir: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
  consoleLevel: process.env.LOG_LEVEL || 'info',
  fileLevel: 'debug',
  enableConsole: true,
  enableFile: true,
  enableRotation: true
});

// Convenience exports
export const getLogger = (service: string) => loggerRegistry.getLogger(service);
export const getAgentLogger = (agentName: string) => loggerRegistry.getAgentLogger(agentName);
export const getMCPLogger = (serverName: string) => loggerRegistry.getMCPLogger(serverName);
export const getChatLogger = (platform: string) => loggerRegistry.getChatLogger(platform);