'use client'

import { useState, useEffect } from 'react'
import { useSocket } from '@/hooks/useSocket'

interface Event {
  id: string
  type: string
  source: string
  priority: string
  timestamp: Date
  data: any
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

export default function EventMonitor() {
  const [events, setEvents] = useState<Event[]>([])
  const [filter, setFilter] = useState<string>('all')
  const socket = useSocket()

  useEffect(() => {
    if (!socket) return

    socket.on('event:new', (event: Event) => {
      setEvents(prev => [event, ...prev].slice(0, 100)) // Keep last 100 events
    })

    socket.on('event:update', (update: { id: string; status: Event['status'] }) => {
      setEvents(prev => prev.map(e => 
        e.id === update.id ? { ...e, status: update.status } : e
      ))
    })

    return () => {
      socket.off('event:new')
      socket.off('event:update')
    }
  }, [socket])

  const filteredEvents = filter === 'all' 
    ? events 
    : events.filter(e => e.source === filter)

  const getStatusColor = (status: Event['status']) => {
    switch (status) {
      case 'pending': return 'text-yellow-400'
      case 'processing': return 'text-blue-400'
      case 'completed': return 'text-green-400'
      case 'failed': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-600'
      case 'high': return 'bg-orange-600'
      case 'medium': return 'bg-yellow-600'
      case 'low': return 'bg-gray-600'
      default: return 'bg-gray-600'
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Live Event Stream</h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-gray-800 text-sm rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="all">All Sources</option>
          <option value="twitch-chat">Twitch Chat</option>
          <option value="discord">Discord</option>
          <option value="social-monitor">Social Media</option>
          <option value="dashboard">Dashboard</option>
        </select>
      </div>

      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No events yet. Waiting for activity...
          </div>
        ) : (
          filteredEvents.map((event) => (
            <div
              key={event.id}
              className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-medium text-sm">{event.type}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${getPriorityBadge(event.priority)}`}>
                      {event.priority}
                    </span>
                    <span className={`text-xs ${getStatusColor(event.status)}`}>
                      {event.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    Source: {event.source} • {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                  {event.data && (
                    <div className="mt-2 text-xs text-gray-300 font-mono bg-gray-900 p-2 rounded">
                      {JSON.stringify(event.data, null, 2).substring(0, 200)}
                      {JSON.stringify(event.data).length > 200 && '...'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}