#!/usr/bin/env tsx

/**
 * Dashboard Server - WebSocket server for real-time dashboard updates
 */

import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import path from 'path'
import { getLogger } from '@rusty-butter/logger'
import { QueueManager, QueueMessage } from '@rusty-butter/shared/queue-manager'

const logger = getLogger('dashboard-server')

const app = express()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"]
  }
})

app.use(cors())
app.use(express.json())

// Queue manager instance
const queueManager = new QueueManager(
  process.env.QUEUE_DIR || path.join(process.cwd(), '../orchestrator/queues')
)

// System status tracking
let systemStatus = {
  orchestrator: {
    status: 'online' as const,
    activeClaudes: 0,
    queueSizes: { action: 0, performance: 0 }
  },
  monitors: [
    { name: 'twitch-monitor', status: 'connected' as const },
    { name: 'discord-monitor', status: 'connected' as const },
    { name: 'social-monitor', status: 'connected' as const },
    { name: 'event-monitor', status: 'connected' as const }
  ],
  tools: [
    { name: 'playwright-sse', status: 'running' as const, port: 3456 },
    { name: 'discord-tools', status: 'running' as const, port: 3457 }
  ]
}

// Track connected clients
const connectedClients = new Set<string>()

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`)
  connectedClients.add(socket.id)

  // Send initial system status
  socket.emit('system:status', systemStatus)

  // Handle system status requests
  socket.on('system:request-status', () => {
    socket.emit('system:status', systemStatus)
  })

  // Handle chat messages from dashboard
  socket.on('chat:send', async (data: {
    text: string
    priority: 'critical' | 'high' | 'normal'
    source: string
    user: string
  }) => {
    logger.info(`Priority chat from ${data.user}: ${data.text}`)

    // Create a queue message with appropriate priority
    const message: QueueMessage = {
      id: `dashboard-${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: 'dashboard',
      priority: data.priority === 'critical' ? 'critical' : 
               data.priority === 'high' ? 'high' : 'medium',
      action: {
        type: 'respond',
        content: data.text,
        data: {
          message: data.text,
          user: data.user,
          isDashboardPriority: true
        }
      },
      context: {
        platform: 'dashboard',
        requires_response: true,
        priority_user: data.user === 'CodingButter'
      },
      ttl: 300
    }

    // Add to queue
    await queueManager.addMessage(message)

    // Send response back
    socket.emit('chat:message', {
      id: Date.now().toString(),
      text: `Processing your ${data.priority} priority message...`,
      sender: 'rusty',
      timestamp: new Date()
    })
  })

  // Handle queue requests
  socket.on('queue:request', async () => {
    const messages = await queueManager.getMessages()
    
    // Separate into action and performance queues
    const actionQueue = messages
      .filter(m => ['code_request', 'analysis'].includes(m.action.type))
      .map((m, i) => ({ ...m, position: i + 1 }))
    
    const performanceQueue = messages
      .filter(m => !['code_request', 'analysis'].includes(m.action.type))
      .map((m, i) => ({ ...m, position: i + 1 }))

    socket.emit('queue:update', {
      action: actionQueue,
      performance: performanceQueue
    })
  })

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`)
    connectedClients.delete(socket.id)
  })
})

// Initialize queue manager and listen for events
queueManager.initialize().then(() => {
  logger.info('Queue manager initialized')

  // Listen for new queue messages
  queueManager.on('message', (message: QueueMessage) => {
    // Broadcast new event to all clients
    io.emit('event:new', {
      id: message.id,
      type: message.action.type,
      source: message.source,
      priority: message.priority,
      timestamp: message.timestamp,
      data: message.action.data,
      status: 'pending' as const
    })
  })
})

// Update system status periodically
setInterval(async () => {
  const messages = await queueManager.getMessages()
  const actionQueue = messages.filter(m => ['code_request', 'analysis'].includes(m.action.type))
  const performanceQueue = messages.filter(m => !['code_request', 'analysis'].includes(m.action.type))

  systemStatus.orchestrator.queueSizes = {
    action: actionQueue.length,
    performance: performanceQueue.length
  }

  io.emit('system:status', systemStatus)
}, 5000)

const PORT = process.env.DASHBOARD_PORT || 3458

server.listen(PORT, () => {
  logger.info(`Dashboard server running on port ${PORT}`)
})