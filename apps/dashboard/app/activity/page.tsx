'use client'

import { useState, useEffect } from 'react'
import { Activity, Clock, User, MessageSquare, Mic, Code, Brain, TrendingUp, Calendar, Filter } from 'lucide-react'

interface ActivityEvent {
  id: string
  type: string
  source: string
  timestamp: string
  user?: string
  message?: string
  duration?: number
  status: 'success' | 'error' | 'pending'
  details?: any
}

interface ActivityStats {
  totalEvents: number
  eventsToday: number
  averageResponseTime: number
  activeUsers: string[]
  topSources: { source: string; count: number }[]
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [stats, setStats] = useState<ActivityStats | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<string>('24h')
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<ActivityEvent | null>(null)

  useEffect(() => {
    fetchActivityData()
    const interval = setInterval(fetchActivityData, 5000)
    return () => clearInterval(interval)
  }, [timeRange, filter])

  const fetchActivityData = async () => {
    try {
      setLoading(true);
      
      // Get activity events from MongoDB
      const eventsResponse = await fetch(`http://localhost:8742/api/activity/events?` + new URLSearchParams({
        filter: filter !== 'all' ? filter : '',
        timeRange,
        limit: '50',
        offset: '0'
      }));
      
      const eventsData = await eventsResponse.json();
      
      // Get event stats from MongoDB
      const statsResponse = await fetch(`http://localhost:8742/api/activity/events/stats`);
      const statsData = await statsResponse.json();
      
      // Update state
      setEvents(eventsData.events);
      setStats({
        totalEvents: statsData.totalEvents,
        eventsToday: statsData.eventsByDay[new Date().toISOString().split('T')[0]] || 0,
        averageResponseTime: statsData.averageDuration,
        activeUsers: statsData.uniqueUsers.slice(0, 10),
        topSources: statsData.eventsBySource
          .map(([source, count]: [string, number]) => ({ source, count }))
          .sort((a: any, b: any) => b.count - a.count)
          .slice(0, 5)
      });
      
      setLoading(false);
      
    } catch (error) {
      console.error('Failed to fetch activity:', error);
      setLoading(false);
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'chat_message': return MessageSquare
      case 'voice_synthesis': return Mic
      case 'claude_processing':
      case 'llm_processing': return Brain
      case 'memory_query': return Brain
      case 'event_processed': return Activity
      default: return Activity
    }
  }

  const getEventColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-[#3fb950]'
      case 'error': return 'text-[#f85149]'
      case 'pending': return 'text-[#d29922]'
      default: return 'text-[#7d8590]'
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#e6edf3] mb-2 flex items-center gap-2">
            <Activity className="h-6 w-6 text-[#58a6ff]" />
            Activity
          </h1>
          <p className="text-[#7d8590] text-sm">Real-time system events and monitoring</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#7d8590]" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-[#21262d] border border-[#30363d] text-sm rounded-md px-3 py-1.5 text-[#e6edf3] focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
            >
              <option value="all">All Events</option>
              <option value="chat_message">Chat Messages</option>
              <option value="voice_synthesis">Voice Synthesis</option>
              <option value="llm_processing">LLM Processing</option>
              <option value="memory_query">Memory Queries</option>
              <option value="error">Errors</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#7d8590]" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-[#21262d] border border-[#30363d] text-sm rounded-md px-3 py-1.5 text-[#e6edf3] focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#161b22] border border-[#30363d] rounded-md p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#7d8590] font-medium">Total Events</p>
                  <p className="text-xl font-semibold text-[#e6edf3] mt-1">{stats.totalEvents}</p>
                </div>
                <div className="w-8 h-8 bg-[#0969da]/10 rounded-md flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-[#0969da]" />
                </div>
              </div>
            </div>
            
            <div className="bg-[#161b22] border border-[#30363d] rounded-md p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#7d8590] font-medium">Active Today</p>
                  <p className="text-xl font-semibold text-[#e6edf3] mt-1">{stats.eventsToday}</p>
                </div>
                <div className="w-8 h-8 bg-[#238636]/10 rounded-md flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-[#238636]" />
                </div>
              </div>
            </div>
            
            <div className="bg-[#161b22] border border-[#30363d] rounded-md p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#7d8590] font-medium">Avg Response</p>
                  <p className="text-xl font-semibold text-[#e6edf3] mt-1">{stats.averageResponseTime}ms</p>
                </div>
                <div className="w-8 h-8 bg-[#8250df]/10 rounded-md flex items-center justify-center">
                  <Clock className="h-4 w-4 text-[#8250df]" />
                </div>
              </div>
            </div>
            
            <div className="bg-[#161b22] border border-[#30363d] rounded-md p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#7d8590] font-medium">Active Users</p>
                  <p className="text-xl font-semibold text-[#e6edf3] mt-1">{stats.activeUsers.length}</p>
                </div>
                <div className="w-8 h-8 bg-[#fb8500]/10 rounded-md flex items-center justify-center">
                  <User className="h-4 w-4 text-[#fb8500]" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top Sources */}
        {stats && stats.topSources.length > 0 && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-md p-4 mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm text-[#7d8590]">Top Sources:</span>
              {stats.topSources.map(({ source, count }) => (
                <span
                  key={source}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-[#0969da]/10 border border-[#0969da]/20 text-xs"
                >
                  <span className="text-[#58a6ff] font-medium">{source}</span>
                  <span className="ml-1 text-[#7d8590]">({count})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Activity Timeline */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-md">
          <div className="px-4 py-3 border-b border-[#30363d]">
            <h2 className="text-sm font-semibold text-[#e6edf3]">Activity Timeline</h2>
          </div>
          
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#58a6ff] border-t-transparent mx-auto"></div>
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center text-[#7d8590]">
              No activity events found
            </div>
          ) : (
            <div className="divide-y divide-[#30363d]">
              {events.map((event) => {
                const Icon = getEventIcon(event.type)
                return (
                  <div
                    key={event.id}
                    className="px-4 py-3 hover:bg-[#1c2128] cursor-pointer transition-colors"
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 ${getEventColor(event.status).replace('dark:', '')}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium text-[#e6edf3] text-sm">
                            {event.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#1c2128] border border-[#30363d] text-xs text-[#7d8590]">
                            {event.source}
                          </span>
                          {event.user && (
                            <span className="text-xs text-[#7d8590]">
                              by {event.user}
                            </span>
                          )}
                        </div>
                        
                        {event.message && (
                          <p className="text-sm text-[#7d8590] mb-1 truncate">
                            {event.message}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-3 text-xs text-[#7d8590]">
                          <span>{formatTimestamp(event.timestamp)}</span>
                          {event.duration && (
                            <span>Duration: {event.duration}ms</span>
                          )}
                          <span className={`${getEventColor(event.status).replace('dark:', '')}`}>
                            {event.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Event Details Modal */}
        {selectedEvent && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedEvent(null)}
          >
            <div
              className="bg-[#161b22] border border-[#30363d] rounded-md p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto scrollbar-github"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#e6edf3]">Event Details</h2>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-[#7d8590] hover:text-[#e6edf3] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <span className="text-xs text-[#7d8590] uppercase tracking-wide">Event ID</span>
                  <p className="font-mono text-sm text-[#e6edf3] mt-1">{selectedEvent.id}</p>
                </div>
                
                <div>
                  <span className="text-xs text-[#7d8590] uppercase tracking-wide">Type</span>
                  <p className="text-sm text-[#e6edf3] mt-1">{selectedEvent.type}</p>
                </div>
                
                <div>
                  <span className="text-xs text-[#7d8590] uppercase tracking-wide">Source</span>
                  <p className="text-sm text-[#e6edf3] mt-1">{selectedEvent.source}</p>
                </div>
                
                <div>
                  <span className="text-xs text-[#7d8590] uppercase tracking-wide">Timestamp</span>
                  <p className="text-sm text-[#e6edf3] mt-1">{new Date(selectedEvent.timestamp).toLocaleString()}</p>
                </div>
                
                {selectedEvent.user && (
                  <div>
                    <span className="text-xs text-[#7d8590] uppercase tracking-wide">User</span>
                    <p className="text-sm text-[#e6edf3] mt-1">{selectedEvent.user}</p>
                  </div>
                )}
                
                {selectedEvent.message && (
                  <div>
                    <span className="text-xs text-[#7d8590] uppercase tracking-wide">Message</span>
                    <p className="text-sm text-[#e6edf3] mt-1">{selectedEvent.message}</p>
                  </div>
                )}
                
                {selectedEvent.details && (
                  <div>
                    <span className="text-xs text-[#7d8590] uppercase tracking-wide">Additional Details</span>
                    <pre className="mt-2 p-3 bg-[#0d1117] border border-[#30363d] rounded-md text-xs text-[#e6edf3] overflow-x-auto scrollbar-github">
                      {JSON.stringify(selectedEvent.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}