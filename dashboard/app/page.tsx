'use client'

import { useState, useEffect } from 'react'
import EventMonitor from '@/components/EventMonitor'
import PriorityChat from '@/components/PriorityChat'
import SystemStatus from '@/components/SystemStatus'
import QueueViewer from '@/components/QueueViewer'

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('chat')

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-2xl font-bold text-orange-500">Rusty Butter Dashboard</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-400">Status:</span>
              <span className="flex items-center">
                <span className="h-2 w-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                <span className="text-sm">Connected</span>
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-12 gap-6">
          {/* Left sidebar - System Status */}
          <div className="col-span-3">
            <SystemStatus />
          </div>

          {/* Main content area */}
          <div className="col-span-6">
            <div className="bg-gray-900 rounded-lg shadow-xl">
              <div className="border-b border-gray-800">
                <nav className="flex -mb-px">
                  <button
                    onClick={() => setActiveTab('chat')}
                    className={`px-6 py-3 text-sm font-medium ${
                      activeTab === 'chat'
                        ? 'text-orange-500 border-b-2 border-orange-500'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Priority Chat
                  </button>
                  <button
                    onClick={() => setActiveTab('events')}
                    className={`px-6 py-3 text-sm font-medium ${
                      activeTab === 'events'
                        ? 'text-orange-500 border-b-2 border-orange-500'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Event Monitor
                  </button>
                  <button
                    onClick={() => setActiveTab('queue')}
                    className={`px-6 py-3 text-sm font-medium ${
                      activeTab === 'queue'
                        ? 'text-orange-500 border-b-2 border-orange-500'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Queue Viewer
                  </button>
                </nav>
              </div>
              <div className="p-6">
                {activeTab === 'chat' && <PriorityChat />}
                {activeTab === 'events' && <EventMonitor />}
                {activeTab === 'queue' && <QueueViewer />}
              </div>
            </div>
          </div>

          {/* Right sidebar - Activity Log */}
          <div className="col-span-3">
            <div className="bg-gray-900 rounded-lg shadow-xl p-4">
              <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
              <div className="space-y-2 text-sm">
                <div className="p-2 bg-gray-800 rounded">
                  <span className="text-gray-400">14:20:47</span>
                  <p className="text-green-400">Claude spawned successfully</p>
                </div>
                <div className="p-2 bg-gray-800 rounded">
                  <span className="text-gray-400">14:20:46</span>
                  <p className="text-blue-400">Orchestrator initialized</p>
                </div>
                <div className="p-2 bg-gray-800 rounded">
                  <span className="text-gray-400">14:20:44</span>
                  <p className="text-yellow-400">MCP servers connected</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}