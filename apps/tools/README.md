# MCP Tools Directory

This directory contains shared MCP (Model Context Protocol) tool servers that can be used by any Claude instance in the system.

## Architecture

Each tool server:
- Runs as a persistent SSE (Server-Sent Events) service
- Can be accessed by multiple Claude instances simultaneously
- Maintains its own state and connections
- Is started once and remains available

## Available Tools

### playwright-sse
Persistent browser automation with Playwright
- Navigate, click, type, screenshot
- Maintains browser sessions across Claude instances
- SSE endpoint for real-time browser events

### discord-tools (planned)
Discord-specific functionality
- Send messages, manage channels, upload files
- Voice channel management
- Server/role management

### twitch-tools (planned)
Twitch-specific functionality
- Chat management
- Stream controls
- Analytics

### social-tools (planned)
Social media integrations
- Twitter, Instagram, Facebook, Reddit, Snapchat
- Post management
- Mention monitoring

### memory-tools (planned)
Enhanced memory operations
- Semantic search
- Graph operations
- Batch operations

## Usage

Tools are started via PM2 and remain running. Monitors and orchestrator can spawn Claude instances with access to specific tool sets based on the task requirements.

Example:
- Coding tasks: playwright-sse, memory-tools
- Social engagement: social-tools, twitch-tools
- Discord management: discord-tools, memory-tools