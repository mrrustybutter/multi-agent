#!/usr/bin/env node
/**
 * @fileoverview Entry point for the RustyButter Avatar HTTP Server
 *
 * This script starts the HTTP server that manages avatar state
 * and serves the web client. It runs independently from the MCP server.
 *
 * Usage: rustybutter-avatar-server [--port PORT]
 *
 * @author CodingButter
 * @version 1.0.5
 */

// Environment variables should be set by claude-with-env.sh script

import { startHttpServer } from './server';
import { execSync } from 'child_process';

/**
 * Kill any existing processes using the port.
 */
function killExistingInstances(port: number) {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (pids) {
      execSync(`kill -9 ${pids}`, { stdio: 'pipe' });
      console.log(`[Server] Killed processes using port ${port}: ${pids}`);
      execSync('sleep 1');
    }
  } catch {
    // No processes found using the port
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let port = 8080;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && i + 1 < args.length) {
    port = parseInt(args[i + 1], 10);
    if (isNaN(port)) {
      console.error('[Server] Invalid port number');
      process.exit(1);
    }
  }
}

// Use environment variable if set, otherwise default to 8080
if (process.env.AVATAR_SERVER_PORT) {
  const envPort = parseInt(process.env.AVATAR_SERVER_PORT, 10);
  if (!isNaN(envPort)) {
    port = envPort;
  }
} else {
  port = 8080; // Default to 8080 if no environment variable
}

// Kill any existing instances before starting
killExistingInstances(port);

// Start the HTTP server
startHttpServer(port);
