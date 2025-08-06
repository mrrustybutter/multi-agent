const path = require('path');
const { config } = require('dotenv');

// Load environment variables
config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    // Core Services (start first)
    // OpenAI Proxy
    {
      name: 'proxy-openai',
      script: 'pnpm',
      args: '--filter @rusty-butter/claude-code-proxy dev',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT: '8744',
        PROVIDER: 'openai',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY
      },
      error_file: './logs/proxy-openai-error.log',
      out_file: './logs/proxy-openai-out.log',
      log_file: './logs/proxy-openai-combined.log',
      time: true
    },
    // Gemini Proxy
    {
      name: 'proxy-gemini',
      script: 'pnpm',
      args: '--filter @rusty-butter/claude-code-proxy dev',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT: '8745',
        PROVIDER: 'gemini',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY
      },
      error_file: './logs/proxy-gemini-error.log',
      out_file: './logs/proxy-gemini-out.log',
      log_file: './logs/proxy-gemini-combined.log',
      time: true
    },
    // Grok Proxy
    {
      name: 'proxy-grok',
      script: 'pnpm',
      args: '--filter @rusty-butter/claude-code-proxy dev',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT: '8746',
        PROVIDER: 'grok',
        GROK_API_KEY: process.env.GROK_API_KEY
      },
      error_file: './logs/proxy-grok-error.log',
      out_file: './logs/proxy-grok-out.log',
      log_file: './logs/proxy-grok-combined.log',
      time: true
    },
    {
      name: 'dashboard-server',
      script: 'node',
      args: 'dist/index.js',
      cwd: path.join(__dirname, 'apps/dashboard-server'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        DASHBOARD_PORT: process.env.DASHBOARD_PORT || '3458'
      },
      error_file: './logs/dashboard-server-error.log',
      out_file: './logs/dashboard-server-out.log',
      log_file: './logs/dashboard-server-combined.log',
      time: true
    },
    {
      name: 'dashboard',
      script: 'pnpm',
      args: '--filter @rusty-butter/dashboard start',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_SOCKET_URL: `http://localhost:${process.env.DASHBOARD_PORT || '3458'}`
      },
      error_file: './logs/dashboard-error.log',
      out_file: './logs/dashboard-out.log',
      log_file: './logs/dashboard-combined.log',
      time: true
    },
    {
      name: 'avatar-server',
      script: 'node',
      args: 'dist/index.js',
      cwd: path.join(__dirname, 'apps/tools/avatar-server'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '150M',
      env: {
        NODE_ENV: 'production',
        AVATAR_SERVER_PORT: process.env.AVATAR_SERVER_PORT || '8080'
      },
      error_file: './logs/avatar-server-error.log',
      out_file: './logs/avatar-server-out.log',
      log_file: './logs/avatar-server-combined.log',
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

    // MCP Tool Servers
    {
      name: 'discord-tools',
      script: 'node',
      args: 'dist/index.js',
      cwd: path.join(__dirname, 'apps/tools/discord-tools'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        DISCORD_TOOLS_PORT: process.env.DISCORD_TOOLS_PORT || '3457',
        DISCORD_TOKEN: process.env.DISCORD_TOKEN,
        DISCORD_GUILD: process.env.DISCORD_GUILD
      },
      error_file: './logs/discord-tools-error.log',
      out_file: './logs/discord-tools-out.log',
      log_file: './logs/discord-tools-combined.log',
      time: true
    },
    {
      name: 'playwright-sse',
      script: 'node',
      args: 'dist/index.js',
      cwd: path.join(__dirname, 'apps/tools/playwright-sse'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PLAYWRIGHT_SSE_PORT: process.env.PLAYWRIGHT_SSE_PORT || '3456'
      },
      error_file: './logs/playwright-sse-error.log',
      out_file: './logs/playwright-sse-out.log',
      log_file: './logs/playwright-sse-combined.log',
      time: true
    },
    
    // Orchestrator (starts after all services are ready)
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
        ELEVEN_API_KEY: process.env.ELEVEN_API_KEY,
        DISCORD_TOKEN: process.env.DISCORD_TOKEN
      },
      error_file: './logs/orchestrator-error.log',
      out_file: './logs/orchestrator-out.log', 
      log_file: './logs/orchestrator-combined.log',
      time: true,
      // Delay start to ensure monitors are ready
      min_uptime: '10s',
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
      'post-deploy': 'pnpm install && pm2 reload ecosystem.config.ts --env production',
      'pre-deploy-local': 'pnpm build'
    }
  }
};