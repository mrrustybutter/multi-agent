import path from 'path';
import { config } from 'dotenv';

// Load environment variables
config({ path: path.join(__dirname, '.env') });

export default {
  apps: [
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
    
    // Orchestrator (starts after monitors)
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