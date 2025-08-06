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
    if (!socket) return

    socket.on('queue:update', (data: { action: QueueItem[], performance: QueueItem[] }) => {
      setActionQueue(data.action)
      setPerformanceQueue(data.performance)
    })

    // Request initial queue state
    socket.emit('queue:request')

    const interval = setInterval(() => {
      socket.emit('queue:request')
    }, 5000) // Refresh every 5 seconds

    return () => {
      socket.off('queue:update')
      clearInterval(interval)
    }
  }, [socket])

  const currentQueue = selectedQueue === 'action' ? actionQueue : performanceQueue

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-600 text-red-100'
      case 'high': return 'bg-orange-600 text-orange-100'
      case 'medium': return 'bg-yellow-600 text-yellow-100'
      case 'low': return 'bg-gray-600 text-gray-100'
      default: return 'bg-gray-600 text-gray-100'
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
      <div className="mb-4">
        <div className="flex space-x-4 mb-4">
          <button
            onClick={() => setSelectedQueue('action')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedQueue === 'action'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Action Queue ({actionQueue.length})
          </button>
          <button
            onClick={() => setSelectedQueue('performance')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedQueue === 'performance'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Performance Queue ({performanceQueue.length})
          </button>
        </div>
      </div>

      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {currentQueue.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Queue is empty
          </div>
        ) : (
          currentQueue.map((item, index) => (
            <div
              key={item.id}
              className="bg-gray-800 rounded-lg p-4 border border-gray-700"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl font-bold text-gray-500">#{index + 1}</span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{item.action.type}</span>
                      <span className={`px-2 py-0.5 text-xs rounded ${getPriorityColor(item.priority)}`}>
                        {item.priority}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      From: {item.source} • ID: {item.id}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-400">
                  TTL: {getRemainingTime(item.timestamp, item.ttl)}
                </div>
              </div>

              <div className="mt-2">
                <p className="text-sm text-gray-300">{item.action.content}</p>
                {item.action.data && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                      View Data
                    </summary>
                    <pre className="mt-2 text-xs text-gray-400 bg-gray-900 p-2 rounded overflow-x-auto">
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