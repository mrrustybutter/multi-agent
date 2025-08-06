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
    // Fetch recent events directly from orchestrator API
    const fetchRecentEvents = async () => {
      try {
        const response = await fetch('http://localhost:8742/api/activity/events?limit=20')
        const data = await response.json()
        
        // Transform MongoDB events to our Event interface
        const transformedEvents: Event[] = data.events.map((event: any) => ({
          id: event.correlationId || event._id,
          type: event.type,
          source: event.source,
          priority: event.priority,
          timestamp: new Date(event.timestamp),
          data: event.data,
          status: event.status === 'completed' ? 'completed' :
                  event.status === 'processing' ? 'processing' :
                  event.status === 'error' ? 'failed' : 'pending'
        }))
        
        setEvents(transformedEvents)
      } catch (error) {
        console.error('Failed to fetch events:', error)
      }
    }
    
    // Initial fetch
    fetchRecentEvents()
    
    // Poll every 3 seconds for new events
    const interval = setInterval(fetchRecentEvents, 3000)
    
    return () => clearInterval(interval)
  }, [])

  const filteredEvents = filter === 'all' 
    ? events 
    : events.filter(e => e.source === filter)

  const getStatusColor = (status: Event['status']) => {
    switch (status) {
      case 'pending': return 'text-[#d29922]'
      case 'processing': return 'text-[#58a6ff]'
      case 'completed': return 'text-[#3fb950]'
      case 'failed': return 'text-[#f85149]'
      default: return 'text-[#7d8590]'
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-[#f85149] text-white'
      case 'high': return 'bg-[#fb8500] text-white'
      case 'medium': return 'bg-[#d29922] text-white'
      case 'low': return 'bg-[#30363d] text-[#7d8590]'
      default: return 'bg-[#30363d] text-[#7d8590]'
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#e6edf3]">Live Event Stream</h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-[#21262d] border border-[#30363d] text-xs rounded-md px-2 py-1 text-[#e6edf3] focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
        >
          <option value="all">All Sources</option>
          <option value="twitch-chat">Twitch Chat</option>
          <option value="discord">Discord</option>
          <option value="social-monitor">Social Media</option>
          <option value="dashboard">Dashboard</option>
        </select>
      </div>

      <div className="space-y-2 max-h-[450px] overflow-y-auto scrollbar-github">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-8 text-[#7d8590] text-sm">
            No events yet. Waiting for activity...
          </div>
        ) : (
          filteredEvents.map((event) => (
            <div
              key={event.id}
              className="bg-[#0d1117] border border-[#30363d] rounded-md p-3 hover:border-[#58a6ff]/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium text-xs text-[#e6edf3]">{event.type}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded-md font-medium ${getPriorityBadge(event.priority)}`}>
                      {event.priority.toUpperCase()}
                    </span>
                    <span className={`text-xs ${getStatusColor(event.status)}`}>
                      • {event.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#7d8590]">
                    {event.source} • {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                  {event.data && (
                    <div className="mt-2 text-[11px] text-[#7d8590] font-mono bg-[#161b22] border border-[#30363d] p-2 rounded-md overflow-hidden">
                      <pre className="whitespace-pre-wrap break-all">
                        {JSON.stringify(event.data, null, 2).substring(0, 150)}
                        {JSON.stringify(event.data).length > 150 && '...'}
                      </pre>
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