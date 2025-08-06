'use client'

import { useState } from 'react'
import dynamicImport from 'next/dynamic'
import { GitBranch, MessageSquare, Activity, Users, Zap, Database } from 'lucide-react'

const EventMonitor = dynamicImport(() => import('@/components/EventMonitor'), { ssr: false })
const PriorityChat = dynamicImport(() => import('@/components/PriorityChat'), { ssr: false })
const SystemStatus = dynamicImport(() => import('@/components/SystemStatus'), { ssr: false })
const QueueViewer = dynamicImport(() => import('@/components/QueueViewer'), { ssr: false })

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('chat')

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[#e6edf3] mb-2">Dashboard</h1>
          <p className="text-[#7d8590] text-sm">Monitor and control your multi-agent system</p>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* System Status Cards - Left Column */}
          <div className="lg:col-span-1">
            <SystemStatus />
          </div>

          {/* Main Interactive Panel - Right Columns */}
          <div className="lg:col-span-2">
            <div className="bg-[#161b22] border border-[#30363d] rounded-md">
              {/* Tabs */}
              <div className="border-b border-[#30363d]">
                <nav className="flex">
                  <button
                    onClick={() => setActiveTab('chat')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 ${
                      activeTab === 'chat'
                        ? 'text-[#e6edf3] border-[#fd7e14]'
                        : 'text-[#7d8590] hover:text-[#e6edf3] border-transparent'
                    }`}
                  >
                    <MessageSquare className="inline h-4 w-4 mr-2" />
                    Priority Chat
                  </button>
                  <button
                    onClick={() => setActiveTab('events')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 ${
                      activeTab === 'events'
                        ? 'text-[#e6edf3] border-[#fd7e14]'
                        : 'text-[#7d8590] hover:text-[#e6edf3] border-transparent'
                    }`}
                  >
                    <Activity className="inline h-4 w-4 mr-2" />
                    Events
                  </button>
                  <button
                    onClick={() => setActiveTab('queue')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 ${
                      activeTab === 'queue'
                        ? 'text-[#e6edf3] border-[#fd7e14]'
                        : 'text-[#7d8590] hover:text-[#e6edf3] border-transparent'
                    }`}
                  >
                    <Zap className="inline h-4 w-4 mr-2" />
                    Queues
                  </button>
                </nav>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {activeTab === 'chat' && <PriorityChat />}
                {activeTab === 'events' && <EventMonitor />}
                {activeTab === 'queue' && <QueueViewer />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}