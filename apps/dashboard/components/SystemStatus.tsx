'use client'

import { useState, useEffect } from 'react'
import { useSocket } from '@/hooks/useSocket'

interface SystemInfo {
  orchestrator: {
    status: 'online' | 'offline'
    activeClaudes: number
    queueSizes: {
      action: number
      performance: number
    }
  }
  monitors: {
    name: string
    status: 'connected' | 'disconnected' | 'error'
  }[]
  tools: {
    name: string
    status: 'running' | 'stopped'
    port?: number
  }[]
}

export default function SystemStatus() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({
    orchestrator: {
      status: 'offline',
      activeClaudes: 0,
      queueSizes: { action: 0, performance: 0 }
    },
    monitors: [],
    tools: []
  })
  const socket = useSocket()

  useEffect(() => {
    if (!socket) return

    socket.on('system:status', (status: SystemInfo) => {
      setSystemInfo(status)
    })

    // Request initial status
    socket.emit('system:request-status')

    return () => {
      socket.off('system:status')
    }
  }, [socket])

  return (
    <div className="space-y-4">
      {/* Orchestrator Status */}
      <div className="bg-gray-900 rounded-lg shadow-xl p-4">
        <h3 className="text-lg font-semibold mb-3 text-orange-500">Orchestrator</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Status</span>
            <span className={`flex items-center ${
              systemInfo.orchestrator.status === 'online' ? 'text-green-400' : 'text-red-400'
            }`}>
              <span className={`h-2 w-2 rounded-full mr-2 ${
                systemInfo.orchestrator.status === 'online' ? 'bg-green-500' : 'bg-red-500'
              }`}></span>
              {systemInfo.orchestrator.status}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Active Claudes</span>
            <span className="text-white font-medium">{systemInfo.orchestrator.activeClaudes}</span>
          </div>
          <div className="pt-2 border-t border-gray-800">
            <div className="text-gray-400 mb-1">Queue Sizes</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span>Action Queue</span>
                <span className="text-blue-400">{systemInfo.orchestrator.queueSizes.action}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>Performance Queue</span>
                <span className="text-purple-400">{systemInfo.orchestrator.queueSizes.performance}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monitors Status */}
      <div className="bg-gray-900 rounded-lg shadow-xl p-4">
        <h3 className="text-lg font-semibold mb-3 text-orange-500">Monitors</h3>
        <div className="space-y-2">
          {systemInfo.monitors.map((monitor) => (
            <div key={monitor.name} className="flex items-center justify-between text-sm">
              <span className="text-gray-400">{monitor.name}</span>
              <span className={`flex items-center ${
                monitor.status === 'connected' ? 'text-green-400' : 
                monitor.status === 'error' ? 'text-red-400' : 'text-yellow-400'
              }`}>
                <span className={`h-2 w-2 rounded-full mr-2 ${
                  monitor.status === 'connected' ? 'bg-green-500 animate-pulse' : 
                  monitor.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                }`}></span>
                {monitor.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tools Status */}
      <div className="bg-gray-900 rounded-lg shadow-xl p-4">
        <h3 className="text-lg font-semibold mb-3 text-orange-500">Tools</h3>
        <div className="space-y-2">
          {systemInfo.tools.map((tool) => (
            <div key={tool.name} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{tool.name}</span>
                <span className={`${
                  tool.status === 'running' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {tool.status}
                </span>
              </div>
              {tool.port && (
                <div className="text-xs text-gray-500 mt-0.5">
                  Port: {tool.port}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}