const path = require('path');

module.exports = {
  apps: [
    // Core Services (start first)
    {
      name: 'claude-proxy',
      script: 'pnpm',
      args: '--filter @rusty-butter/claude-code-proxy dev',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        CLAUDE_PROXY_PORT: process.env.CLAUDE_PROXY_PORT || '8743'
      },
      error_file: './logs/claude-proxy-error.log',
      out_file: './logs/claude-proxy-out.log',
      log_file: './logs/claude-proxy-combined.log',
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
      script: 'sh',
      args: ['-c', 'cd apps/dashboard && npm run dev'],
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        NEXT_PUBLIC_SOCKET_URL: `http://localhost:${process.env.DASHBOARD_PORT || '3458'}`,
        PORT: '3000'
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
      script: 'sh',
      args: ['-c', 'cd apps/monitors/twitch-monitor && npm run dev'],
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
      script: 'sh',
      args: ['-c', 'cd apps/monitors/discord-monitor && npm run dev'],
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
      script: 'sh',
      args: ['-c', 'cd apps/monitors/event-monitor && npm run dev'],
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
    {
      name: 'twitch-chat',
      script: 'sh',
      args: ['-c', 'cd apps/tools/twitch-chat && npm run dev'],
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        TWITCH_USERNAME: process.env.TWITCH_USERNAME,
        TWITCH_OAUTH: process.env.TWITCH_OAUTH,
        TWITCH_CHANNEL: process.env.TWITCH_CHANNEL || 'codingbutter'
      },
      error_file: './logs/twitch-chat-error.log',
      out_file: './logs/twitch-chat-out.log',
      log_file: './logs/twitch-chat-combined.log',
      time: true
    },
    {
      name: 'elevenlabs',
      script: 'sh',
      args: ['-c', 'cd apps/tools/elevenlabs && npm run dev'],
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        ELEVEN_API_KEY: process.env.ELEVEN_API_KEY,
        ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID
      },
      error_file: './logs/elevenlabs-error.log',
      out_file: './logs/elevenlabs-out.log',
      log_file: './logs/elevenlabs-combined.log',
      time: true
    },
    
    // Orchestrator (starts after all services are ready)
    {
      name: 'orchestrator',
      script: 'sh',
      args: ['-c', 'cd apps/orchestrator && npm run dev'],
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
  ]
};