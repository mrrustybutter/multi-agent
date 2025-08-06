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
import { getPort } from '@rusty-butter/shared'

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

// Debug endpoint to see current system status
app.get('/debug/status', (req, res) => {
  res.json(systemStatus)
})

// Service Management API
app.post('/api/services/:serviceName/:action', async (req, res) => {
  const { serviceName, action } = req.params
  
  try {
    logger.info(`Service management: ${action} ${serviceName}`)
    
    const { execSync } = await import('child_process')
    
    switch (action) {
      case 'start':
        // Start service via PM2
        execSync(`pm2 start ${serviceName}`, { encoding: 'utf-8' })
        res.json({ success: true, message: `Started ${serviceName}` })
        break
        
      case 'stop':
        execSync(`pm2 stop ${serviceName}`, { encoding: 'utf-8' })
        res.json({ success: true, message: `Stopped ${serviceName}` })
        break
        
      case 'restart':
        execSync(`pm2 restart ${serviceName}`, { encoding: 'utf-8' })
        res.json({ success: true, message: `Restarted ${serviceName}` })
        break
        
      default:
        res.status(400).json({ error: 'Invalid action. Use start, stop, or restart' })
    }
  } catch (error) {
    logger.error(`Service management failed: ${error}`)
    res.status(500).json({ error: `Failed to ${action} ${serviceName}` })
  }
})

// Audio Control API
app.post('/api/audio/stop', async (req, res) => {
  try {
    logger.info('Force stopping audio playback')
    
    // Kill any audio processes
    const { execSync } = await import('child_process')
    execSync('pkill -f "aplay|paplay|pulseaudio|alsa" || true', { encoding: 'utf-8' })
    
    // Send stop signal to orchestrator if it has audio control
    const response = await fetch(`http://localhost:${getPort('orchestrator')}/audio/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => null)
    
    res.json({ success: true, message: 'Audio playback stopped' })
    
    // Broadcast to connected clients
    io.emit('audio:stopped', { timestamp: new Date().toISOString() })
  } catch (error) {
    logger.error(`Audio stop failed: ${error}`)
    res.status(500).json({ error: 'Failed to stop audio' })
  }
})

// Queue Management API
app.post('/api/queue/clear', async (req, res) => {
  try {
    logger.info('Clearing orchestrator queues')
    
    // Send clear signal to orchestrator
    const response = await fetch(`http://localhost:${getPort('orchestrator')}/queue/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (response.ok) {
      const result = await response.json() as Record<string, any>
      res.json({ success: true, message: 'Queues cleared', ...result })
      
      // Broadcast to connected clients
      io.emit('queue:cleared', { timestamp: new Date().toISOString() })
    } else {
      throw new Error('Orchestrator queue clear failed')
    }
  } catch (error) {
    logger.error(`Queue clear failed: ${error}`)
    res.status(500).json({ error: 'Failed to clear queues' })
  }
})

// Queue manager instance
const queueManager = new QueueManager(
  process.env.QUEUE_DIR || path.join(process.cwd(), '../orchestrator/queues')
)

// System status tracking - will be updated with real data
let systemStatus = {
  orchestrator: {
    status: 'offline' as 'online' | 'offline',
    activeLLMs: { claude: 0, others: 0 },
    queueSizes: { action: 0, performance: 0, voiceQueue: 0 }
  },
  monitors: [
    { name: 'twitch-monitor', status: 'disconnected' as 'connected' | 'disconnected' },
    { name: 'discord-monitor', status: 'disconnected' as 'connected' | 'disconnected' },
    { name: 'social-monitor', status: 'disconnected' as 'connected' | 'disconnected' },
    { name: 'event-monitor', status: 'disconnected' as 'connected' | 'disconnected' }
  ],
  tools: [
    // MCP Servers that provide interaction capabilities
    { name: 'elevenlabs', status: 'stopped' as 'running' | 'stopped', description: 'Text-to-speech' },
    { name: 'twitch-chat', status: 'stopped' as 'running' | 'stopped', description: 'Send messages to Twitch' },
    { name: 'discord', status: 'stopped' as 'running' | 'stopped', description: 'Discord voice & chat' },
    { name: 'twitter/X', status: 'stopped' as 'running' | 'stopped', description: 'Post & search tweets' },
    { name: 'playwright', status: 'stopped' as 'running' | 'stopped', description: 'Web automation' },
    { name: 'obs', status: 'stopped' as 'running' | 'stopped', description: 'Stream control' },
    { name: 'rustybutter-avatar', status: 'stopped' as 'running' | 'stopped', description: 'Avatar control' },
    { name: 'semantic-memory', status: 'stopped' as 'running' | 'stopped', description: 'AI memory' }
  ]
}

// Service health check function
async function checkServiceHealth(port: number, path: string = '/health'): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}${path}`, { 
      signal: AbortSignal.timeout(2000) // 2 second timeout
    })
    return response.ok
  } catch {
    return false
  }
}

// Update system status with real data
async function updateSystemStatus() {
  try {
    // Check orchestrator status
    const orchestratorResponse = await fetch(`http://localhost:${getPort('orchestrator')}/status`, {
      signal: AbortSignal.timeout(3000)
    })
    
    if (orchestratorResponse.ok) {
      const orchestratorData = await orchestratorResponse.json() as any
      systemStatus.orchestrator.status = 'online'
      systemStatus.orchestrator.activeLLMs.claude = orchestratorData.activeLLMs?.claude?.length || 0
      systemStatus.orchestrator.activeLLMs.others = orchestratorData.activeLLMs?.others?.length || 0
      systemStatus.orchestrator.queueSizes.action = orchestratorData.queueSize || 0
      systemStatus.orchestrator.queueSizes.performance = orchestratorData.queuePending || 0
      systemStatus.orchestrator.queueSizes.voiceQueue = orchestratorData.voiceQueueSize || 0
      
      // Update MCP server status from orchestrator
      const mcpServers = orchestratorData.mcpServers || []
      systemStatus.tools.forEach(tool => {
        if (mcpServers.includes(tool.name)) {
          tool.status = 'running'
        } else {
          tool.status = 'stopped'
        }
      })
    } else {
      systemStatus.orchestrator.status = 'offline'
    }
  } catch (error) {
    logger.warn('Failed to fetch orchestrator status:', error)
    systemStatus.orchestrator.status = 'offline'
  }

  // Check individual service health
  const serviceChecks = [
    { port: getPort('avatar-server'), name: 'rustybutter-avatar' },
    { port: getPort('discord-tools'), name: 'discord' },
    { port: getPort('playwright-sse'), name: 'playwright' },
    { port: getPort('twitch-chat'), name: 'twitch-chat' },
    { port: getPort('elevenlabs'), name: 'elevenlabs' }
  ]

  for (const service of serviceChecks) {
    const isHealthy = await checkServiceHealth(service.port)
    const tool = systemStatus.tools.find(t => t.name === service.name)
    if (tool) {
      tool.status = isHealthy ? 'running' : 'stopped'
    }
  }

  // Check monitor processes by looking for their process names
  const monitorChecks = [
    { name: 'twitch-monitor', process: 'twitch-monitor' },
    { name: 'discord-monitor', process: 'discord-monitor' },
    { name: 'event-monitor', process: 'event-monitor' }
  ]

  for (const monitor of monitorChecks) {
    try {
      // Check if process is running by looking for it in ps output
      const { execSync } = await import('child_process')
      const result = execSync(`pgrep -f "${monitor.process}"`, { encoding: 'utf-8' }).trim()
      const isRunning = result.length > 0
      
      const monitorStatus = systemStatus.monitors.find(m => m.name === monitor.name)
      if (monitorStatus) {
        monitorStatus.status = isRunning ? 'connected' : 'disconnected'
      }
    } catch {
      // pgrep returns non-zero exit code if no matches found
      const monitorStatus = systemStatus.monitors.find(m => m.name === monitor.name)
      if (monitorStatus) {
        monitorStatus.status = 'disconnected'
      }
    }
  }

  logger.debug('Updated system status:', systemStatus)
}

// Track connected clients
const connectedClients = new Set<string>()

// Track recent events for event monitor
const recentEvents: any[] = []

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`)
  connectedClients.add(socket.id)

  // Send initial system status
  socket.emit('system:status', systemStatus)
  
  // Send recent events to new client
  recentEvents.forEach(event => {
    socket.emit('event:new', event)
  })

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

    // Determine if this is a code-related message or general chat
    const isCodeRelated = /\b(code|bug|fix|debug|implement|function|class|variable|error|exception|api|database|server|deploy|build|test|typescript|javascript|python|react|node|npm|git|github|pull request|merge|commit|branch)\b/i.test(data.text) ||
                         /[\{\}\[\]();]/.test(data.text) || // Contains code-like syntax
                         data.text.includes('```') || // Contains code blocks
                         /\b(how to|help me|can you)\s+(write|create|build|make|fix|debug|implement)/i.test(data.text)

    const eventType = isCodeRelated ? 'chat' : 'speak'
    
    logger.info(`Detected message type: ${eventType} (code-related: ${isCodeRelated})`)

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

    // Send to orchestrator instead of queue
    try {
      const response = await fetch(`http://localhost:${getPort('orchestrator')}/event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source: 'dashboard',
          type: eventType,
          priority: data.priority === 'critical' ? 'critical' : 
                   data.priority === 'high' ? 'high' : 'medium',
          data: {
            message: data.text,
            user: data.user,
            isDashboardPriority: true
          }
        })
      })
      
      const result = await response.json() as { eventId: string }
      
      // Create event for event monitor
      const chatEvent = {
        id: result.eventId,
        type: 'chat',
        source: 'dashboard',
        priority: data.priority,
        timestamp: new Date(),
        data: {
          message: data.text,
          user: data.user
        },
        status: 'pending' as const
      }
      
      // Add to recent events and broadcast
      recentEvents.unshift(chatEvent)
      if (recentEvents.length > 100) recentEvents.pop()
      io.emit('event:new', chatEvent)
      
      // Send response back
      socket.emit('chat:message', {
        id: Date.now().toString(),
        text: `✓ Message sent to orchestrator (Event ID: ${result.eventId})`,
        sender: 'rusty',
        timestamp: new Date()
      })
      
      // Update event status after delay
      setTimeout(() => {
        const eventToUpdate = recentEvents.find(e => e.id === chatEvent.id)
        if (eventToUpdate) {
          eventToUpdate.status = 'processing'
          io.emit('event:update', { id: chatEvent.id, status: 'processing' })
        }
      }, 1000)
      
      setTimeout(() => {
        const eventToUpdate = recentEvents.find(e => e.id === chatEvent.id)
        if (eventToUpdate) {
          eventToUpdate.status = 'completed'
          io.emit('event:update', { id: chatEvent.id, status: 'completed' })
        }
      }, 5000)
    } catch (error) {
      logger.error('Failed to send to orchestrator:', error)
      socket.emit('chat:message', {
        id: Date.now().toString(),
        text: `❌ Failed to send message to orchestrator`,
        sender: 'rusty',
        timestamp: new Date()
      })
    }
  })

  // Handle queue requests
  socket.on('queue:request', async () => {
    try {
      // Fetch real status from orchestrator
      const response = await fetch(`http://localhost:${getPort('orchestrator')}/status`)
      const status = await response.json() as any
      
      // Create mock queue items for demonstration
      const activeClaudes = status.activeLLMs?.claude || []
      const mockActionQueue = activeClaudes.map((claude: any, idx: number) => ({
        id: claude.id,
        source: 'orchestrator',
        priority: idx === 0 ? 'high' : 'medium',
        action: {
          type: 'process_event',
          content: `Processing ${claude.role} for event ${claude.eventId}`,
          data: { claudeId: claude.id, uptime: claude.uptime }
        },
        timestamp: new Date(Date.now() - claude.uptime).toISOString(),
        ttl: 300,
        position: idx + 1
      })) || []
      
      // Add any pending items to performance queue
      const mockPerformanceQueue = status.queuePending > 0 ? [{
        id: `perf-${Date.now()}`,
        source: 'orchestrator',
        priority: 'medium',
        action: {
          type: 'voice_synthesis',
          content: 'Voice queue items pending',
          data: { pending: status.queuePending }
        },
        timestamp: new Date().toISOString(),
        ttl: 300,
        position: 1
      }] : []
      
      socket.emit('queue:update', {
        action: mockActionQueue,
        performance: mockPerformanceQueue,
        orchestratorStatus: {
          activeLLMs: status.activeLLMs || { claude: [], others: [] },
          queueSize: status.queueSize || 0,
          queuePending: status.queuePending || 0
        }
      })
    } catch (error) {
      logger.error('Failed to fetch orchestrator status:', error)
      // Return empty queues on error
      socket.emit('queue:update', {
        action: [],
        performance: []
      })
    }
  })

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`)
    connectedClients.delete(socket.id)
  })
})

// Initialize queue manager but don't use it for now
// Since we're using direct API calls to orchestrator
queueManager.initialize().then(() => {
  logger.info('Queue manager initialized (legacy - not used)')
  
  // Clear any old queue data on startup
  io.emit('queue:update', {
    action: [],
    performance: []
  })
})

// Update system status periodically and fetch recent events
setInterval(async () => {
  await updateSystemStatus()
  io.emit('system:status', systemStatus)
  
  // Fetch recent events from orchestrator and broadcast to clients
  await fetchAndBroadcastEvents()
}, 5000)

// Function to fetch recent events and broadcast them
async function fetchAndBroadcastEvents() {
  try {
    // Check if orchestrator is available
    const orchestratorUrl = `http://localhost:${getPort('orchestrator')}/status`
    const response = await fetch(orchestratorUrl, { 
      signal: AbortSignal.timeout(3000) 
    })
    
    if (response.ok) {
      const status = await response.json() as any
      
      // Broadcast queue updates with real orchestrator data
      io.emit('queue:update', {
        action: [], // Action queue not implemented yet in orchestrator
        performance: [], // Performance queue not implemented yet in orchestrator
        orchestratorStatus: {
          activeLLMs: status.activeLLMs || { claude: [], others: [] },
          queueSize: status.queueSize || 0,
          queuePending: status.queuePending || 0,
          eventHistory: status.eventHistory || 0
        }
      })

      // If there are active LLMs, create events for the event monitor
      const activeClaudes = status.activeLLMs?.claude || []
      if (activeClaudes.length > 0) {
        for (const claude of activeClaudes) {
          // Check if we already have this event
          const existingEvent = recentEvents.find(e => e.id === claude.eventId)
          
          if (!existingEvent) {
            // Create a new event for each active Claude
            const newEvent = {
              id: claude.eventId || `event-${claude.id}`,
              type: 'claude_processing',
              source: 'orchestrator',
              priority: 'medium',
              timestamp: new Date(Date.now() - claude.uptime),
              data: {
                claudeId: claude.id,
                role: claude.role,
                status: claude.status,
                uptime: claude.uptime
              },
              status: claude.status === 'running' ? 'processing' as const : 'completed' as const
            }
            
            // Add to recent events
            recentEvents.unshift(newEvent)
            if (recentEvents.length > 100) recentEvents.pop()
            
            // Broadcast the new event
            io.emit('event:new', newEvent)
          } else if (existingEvent.status !== 'completed' && claude.status !== 'running') {
            // Update existing event status
            existingEvent.status = 'completed'
            io.emit('event:update', { id: existingEvent.id, status: 'completed' })
          }
        }
      }
    }
  } catch (error) {
    logger.debug('Could not fetch orchestrator events (orchestrator may be offline):', error)
  }
}

// Initial status update
updateSystemStatus().then(() => {
  logger.info('Initial system status updated')
})

const PORT = getPort('dashboard')

server.listen(PORT, () => {
  logger.info(`Dashboard server running on port ${PORT}`)
})