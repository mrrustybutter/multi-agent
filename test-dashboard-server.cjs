#!/usr/bin/env node

// Simple test server for dashboard
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// System status
let systemStatus = {
  orchestrator: {
    status: 'online',
    activeClaudes: 1,
    queueSizes: { action: 0, performance: 0 }
  },
  monitors: [
    { name: 'twitch-monitor', status: 'connected' },
    { name: 'discord-monitor', status: 'connected' },
    { name: 'social-monitor', status: 'connected' },
    { name: 'event-monitor', status: 'connected' }
  ],
  tools: [
    { name: 'playwright-sse', status: 'running', port: 3456 },
    { name: 'discord-tools', status: 'running', port: 3457 }
  ]
};

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Send initial system status
  socket.emit('system:status', systemStatus);
  
  socket.on('system:request-status', () => {
    socket.emit('system:status', systemStatus);
  });
  
  socket.on('chat:send', (data) => {
    console.log(`Priority chat from ${data.user}: ${data.text}`);
    
    // Echo back
    socket.emit('chat:message', {
      id: Date.now().toString(),
      text: `Roger that! Processing your ${data.priority} priority message...`,
      sender: 'rusty',
      timestamp: new Date()
    });
  });
  
  socket.on('queue:request', () => {
    socket.emit('queue:update', {
      action: [],
      performance: []
    });
  });
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = 3458;
server.listen(PORT, () => {
  console.log(`Dashboard server running on port ${PORT}`);
});