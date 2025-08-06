'use client'

import { useState, useEffect } from 'react'
import { useSocket } from '@/hooks/useSocket'

interface QueueItem {
  id: string
  source: string
  priority: string
  action: {
    type: string
    content: string
    data?: any
  }
  timestamp: string
  ttl: number
  position: number
}

export default function QueueViewer() {
  const [actionQueue, setActionQueue] = useState<QueueItem[]>([])
  const [performanceQueue, setPerformanceQueue] = useState<QueueItem[]>([])
  const [selectedQueue, setSelectedQueue] = useState<'action' | 'performance'>('action')
  const socket = useSocket()

  useEffect(() => {
    // Fetch queue information directly from orchestrator API
    const fetchQueueInfo = async () => {
      try {
        const response = await fetch('http://localhost:8742/status')
        const status = await response.json()
        
        // Create mock queue items based on orchestrator status
        const mockActionQueue: QueueItem[] = status.queueSize > 0 ? [{
          id: 'queue-item-1',
          source: 'orchestrator',
          priority: 'medium',
          action: {
            type: 'process_events',
            content: `Processing ${status.queueSize} queued events`,
            data: { queueSize: status.queueSize }
          },
          timestamp: new Date().toISOString(),
          ttl: 300,
          position: 1
        }] : []
        
        const mockPerformanceQueue: QueueItem[] = status.voiceQueueSize > 0 ? [{
          id: 'voice-queue-1',
          source: 'voice-processor',
          priority: 'high',
          action: {
            type: 'voice_synthesis',
            content: `Processing ${status.voiceQueueSize} voice synthesis requests`,
            data: { voiceQueueSize: status.voiceQueueSize }
          },
          timestamp: new Date().toISOString(),
          ttl: 180,
          position: 1
        }] : []
        
        setActionQueue(mockActionQueue)
        setPerformanceQueue(mockPerformanceQueue)
      } catch (error) {
        console.error('Failed to fetch queue info:', error)
        setActionQueue([])
        setPerformanceQueue([])
      }
    }
    
    // Initial fetch
    fetchQueueInfo()
    
    // Poll every 5 seconds
    const interval = setInterval(fetchQueueInfo, 5000)
    
    return () => clearInterval(interval)
  }, [])

  const currentQueue = selectedQueue === 'action' ? actionQueue : performanceQueue

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-[#f85149] text-white'
      case 'high': return 'bg-[#fb8500] text-white'
      case 'medium': return 'bg-[#d29922] text-white'
      case 'low': return 'bg-[#30363d] text-[#7d8590]'
      default: return 'bg-[#30363d] text-[#7d8590]'
    }
  }

  const getRemainingTime = (timestamp: string, ttl: number) => {
    const created = new Date(timestamp).getTime()
    const expires = created + (ttl * 1000)
    const remaining = expires - Date.now()
    
    if (remaining <= 0) return 'Expired'
    
    const minutes = Math.floor(remaining / 60000)
    const seconds = Math.floor((remaining % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  return (
    <div>
      <div className="mb-3">
        <div className="inline-flex rounded-md bg-[#0d1117] border border-[#30363d] p-1">
          <button
            onClick={() => setSelectedQueue('action')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedQueue === 'action'
                ? 'bg-[#0969da] text-white'
                : 'text-[#7d8590] hover:text-[#e6edf3]'
            }`}
          >
            Action Queue ({actionQueue.length})
          </button>
          <button
            onClick={() => setSelectedQueue('performance')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedQueue === 'performance'
                ? 'bg-[#0969da] text-white'
                : 'text-[#7d8590] hover:text-[#e6edf3]'
            }`}
          >
            Performance Queue ({performanceQueue.length})
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-[450px] overflow-y-auto scrollbar-github">
        {currentQueue.length === 0 ? (
          <div className="text-center py-8 text-[#7d8590] text-sm">
            Queue is empty
          </div>
        ) : (
          currentQueue.map((item, index) => (
            <div
              key={item.id}
              className="bg-[#0d1117] border border-[#30363d] rounded-md p-3"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-3">
                  <span className="text-lg font-bold text-[#30363d] select-none">#{index + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-[#e6edf3]">{item.action.type}</span>
                      <span className={`px-1.5 py-0.5 text-[10px] rounded-md font-medium ${getPriorityColor(item.priority)}`}>
                        {item.priority.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#7d8590]">
                      {item.source} • {item.id}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-[#7d8590]">
                  TTL: <span className="text-[#e6edf3]">{getRemainingTime(item.timestamp, item.ttl)}</span>
                </div>
              </div>

              <div className="mt-2">
                <p className="text-xs text-[#7d8590]">{item.action.content}</p>
                {item.action.data && (
                  <details className="mt-2 group">
                    <summary className="text-[11px] text-[#7d8590] cursor-pointer hover:text-[#58a6ff] select-none">
                      View Data
                    </summary>
                    <pre className="mt-2 text-[11px] text-[#7d8590] bg-[#161b22] border border-[#30363d] p-2 rounded-md overflow-x-auto">
                      {JSON.stringify(item.action.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}