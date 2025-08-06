#!/usr/bin/env node
import { config as dotenvConfig } from 'dotenv';
import { configService } from '../packages/shared/dist/index.js';
import { getLogger } from '../packages/logger/dist/index.js';

const logger = getLogger('seed-config');

async function seedConfig() {
  try {
    // Load environment variables
    dotenvConfig();
    
    logger.info('Starting configuration seed...');
    
    // Seed from environment
    logger.info('Seeding configuration from .env file...');
    await configService.seedFromEnv();
    
    // Verify the configuration
    const config = await configService.getConfig();
    logger.info('Configuration loaded successfully!');
    logger.info(`- Orchestrator port: ${config.ports?.orchestrator || 8742}`);
    logger.info(`- Claude proxy port: ${config.ports?.claudeProxy || 8743}`);
    logger.info(`- LLM Providers enabled:`);
    
    if (config.llmProviders.openai.enabled) {
      logger.info(`  ✓ OpenAI (${config.llmProviders.openai.model})`);
    }
    if (config.llmProviders.claude.enabled) {
      logger.info(`  ✓ Claude (${config.llmProviders.claude.model})`);
    }
    if (config.llmProviders.gemini.enabled) {
      logger.info(`  ✓ Gemini (${config.llmProviders.gemini.model})`);
    }
    if (config.llmProviders.grok.enabled) {
      logger.info(`  ✓ Grok (${config.llmProviders.grok.model})`);
    }
    if (config.llmProviders.groq.enabled) {
      logger.info(`  ✓ Groq (${config.llmProviders.groq.model})`);
    }
    
    logger.info(`- Platform monitoring:`);
    if (config.monitoring?.discordEnabled) {
      logger.info(`  ✓ Discord (Guild: ${config.monitoring.discordGuildId || 'not set'})`);
    }
    if (config.monitoring?.twitchEnabled) {
      logger.info(`  ✓ Twitch (Username: ${config.monitoring.twitchUsername || 'not set'})`);
    }
    
    logger.info(`- Memory configuration:`);
    logger.info(`  Enabled: ${config.memory?.enabled || false}`);
    logger.info(`  Auto-store: ${config.memory?.autoStore || false}`);
    logger.info(`  Retention: ${config.memory?.retentionDays || 30} days`);
    
    logger.info('✨ Configuration seed complete!');
    process.exit(0);
    
  } catch (error) {
    logger.error('Failed to seed configuration:', error);
    process.exit(1);
  }
}

// Run the seed
seedConfig();