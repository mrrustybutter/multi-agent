const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    // Tool Servers (start first, remain running)
    {
      name: 'playwright-sse',
      script: 'node',
      args: '../tools/playwright-sse/dist/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PLAYWRIGHT_SSE_PORT: process.env.PLAYWRIGHT_SSE_PORT || '3456'
      },
      error_file: './logs/playwright-sse-error.log',
      out_file: './logs/playwright-sse-out.log',
      log_file: './logs/playwright-sse-combined.log',
      time: true
    },
    {
      name: 'discord-tools',
      script: 'node',
      args: '../tools/discord-tools/dist/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        DISCORD_TOOLS_PORT: process.env.DISCORD_TOOLS_PORT || '3457',
        DISCORD_TOKEN: process.env.DISCORD_TOKEN
      },
      error_file: './logs/discord-tools-error.log',
      out_file: './logs/discord-tools-out.log',
      log_file: './logs/discord-tools-combined.log',
      time: true
    },

    // Monitor MCP Servers
    {
      name: 'twitch-monitor',
      script: 'pnpm',
      args: '--filter @rusty-butter/twitch-monitor dev',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        TWITCH_CHANNEL: 'codingbutter',
        TWITCH_USERNAME: process.env.TWITCH_USERNAME,
        TWITCH_OAUTH: process.env.TWITCH_OAUTH
      },
      error_file: './logs/twitch-monitor-error.log',
      out_file: './logs/twitch-monitor-out.log',
      log_file: './logs/twitch-monitor-combined.log',
      time: true
    },
    {
      name: 'discord-monitor',
      script: 'pnpm',
      args: '--filter @rusty-butter/discord-monitor dev',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        DISCORD_TOKEN: process.env.DISCORD_TOKEN,
        DISCORD_GUILD: process.env.DISCORD_GUILD
      },
      error_file: './logs/discord-monitor-error.log',
      out_file: './logs/discord-monitor-out.log',
      log_file: './logs/discord-monitor-combined.log',
      time: true
    },
    {
      name: 'event-monitor',
      script: 'pnpm',
      args: '--filter @rusty-butter/event-monitor dev',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/event-monitor-error.log',
      out_file: './logs/event-monitor-out.log',
      log_file: './logs/event-monitor-combined.log',
      time: true
    },
    {
      name: 'social-monitor',
      script: 'pnpm',
      args: '--filter @rusty-butter/social-monitor dev',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        X_API_KEY: process.env.X_API_KEY,
        X_API_SECRET_KEY: process.env.X_API_SECRET_KEY,
        X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
        X_ACCESS_TOKEN_SECRET: process.env.X_ACCESS_TOKEN_SECRET,
        X_BEARER_TOKEN: process.env.X_BEARER_TOKEN,
        REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
        REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
        REDDIT_USERNAME: process.env.REDDIT_USERNAME,
        REDDIT_PASSWORD: process.env.REDDIT_PASSWORD,
        INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN,
        INSTAGRAM_USER_ID: process.env.INSTAGRAM_USER_ID
      },
      error_file: './logs/social-monitor-error.log',
      out_file: './logs/social-monitor-out.log',
      log_file: './logs/social-monitor-combined.log',
      time: true
    },
    
    // Dashboard Server
    {
      name: 'dashboard-server',
      script: 'pnpm',
      args: '--filter @rusty-butter/dashboard-server dev',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        DASHBOARD_PORT: '3458',
        QUEUE_DIR: path.join(__dirname, 'orchestrator/queues')
      },
      error_file: './logs/dashboard-server-error.log',
      out_file: './logs/dashboard-server-out.log',
      log_file: './logs/dashboard-server-combined.log',
      time: true
    },
    
    // Orchestrator (starts after monitors and tools)
    {
      name: 'orchestrator',
      script: 'pnpm',
      args: '--filter @rusty-butter/orchestrator dev',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        QUEUE_DIR: path.join(__dirname, 'queues'),
        LOG_DIR: path.join(__dirname, 'logs'),
        // LLM Providers
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        LOCAL_LLM_URL: process.env.LOCAL_LLM_URL || 'http://localhost:11434',
        // Service Keys
        ELEVEN_API_KEY: process.env.ELEVEN_API_KEY,
        DISCORD_TOKEN: process.env.DISCORD_TOKEN,
        // Social Media
        X_API_KEY: process.env.X_API_KEY,
        X_API_SECRET_KEY: process.env.X_API_SECRET_KEY,
        X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
        X_ACCESS_TOKEN_SECRET: process.env.X_ACCESS_TOKEN_SECRET,
        X_BEARER_TOKEN: process.env.X_BEARER_TOKEN,
        REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
        REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
        REDDIT_USERNAME: process.env.REDDIT_USERNAME,
        REDDIT_PASSWORD: process.env.REDDIT_PASSWORD
      },
      error_file: './logs/orchestrator-error.log',
      out_file: './logs/orchestrator-out.log', 
      log_file: './logs/orchestrator-combined.log',
      time: true,
      // Delay start to ensure monitors and tools are ready
      min_uptime: '15s',
      max_restarts: 5
    }
  ],
  
  // Deploy configuration
  deploy: {
    production: {
      user: 'rusty',
      host: 'stream-server',
      ref: 'origin/master',
      repo: 'git@github.com:codingbutter/rusty-butter.git',
      path: '/home/rusty/multi-agent',
      'post-deploy': 'pnpm install && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': 'pnpm build'
    }
  }
};