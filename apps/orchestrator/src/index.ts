#!/usr/bin/env tsx

/**
 * Orchestrator - Central API server for the multi-agent system
 * This is the main entry point that bootstraps the orchestrator
 */

import { getLogger } from '@rusty-butter/logger';
import { Orchestrator } from './Orchestrator';

const logger = getLogger('orchestrator');

// Create and start orchestrator
const orchestrator = new Orchestrator();

async function main() {
  try {
    await orchestrator.start();
    logger.info('Orchestrator API server is running on port 8742');
  } catch (error) {
    logger.error('Failed to start orchestrator:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await orchestrator.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await orchestrator.shutdown();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main();