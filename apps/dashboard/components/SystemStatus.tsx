'use client'

import { useState, useEffect } from 'react'
import { useSocket } from '@/hooks/useSocket'

interface SystemInfo {
  orchestrator: {
    status: 'online' | 'offline'
    activeLLMs: {
      claude: number
      others: number
    }
    queueSizes: {
      action: number
      performance: number
      voiceQueue: number
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
      activeLLMs: { claude: 0, others: 0 },
      queueSizes: { action: 0, performance: 0, voiceQueue: 0 }
    },
    monitors: [],
    tools: []
  })
  const socket = useSocket()

  useEffect(() => {
    // Fetch system status directly from orchestrator API
    const fetchSystemStatus = async () => {
      try {
        const response = await fetch('http://localhost:8742/status')
        const orchestratorStatus = await response.json()
        
        // Mock up system info based on orchestrator status 
        const systemInfo: SystemInfo = {
          orchestrator: {
            status: 'online',
            activeLLMs: {
              claude: orchestratorStatus.activeLLMs?.claude?.length || 0,
              others: orchestratorStatus.activeLLMs?.others?.length || 0
            },
            queueSizes: {
              action: orchestratorStatus.queueSize || 0,
              performance: orchestratorStatus.queuePending || 0,
              voiceQueue: orchestratorStatus.voiceQueueSize || 0
            }
          },
          monitors: [
            { name: 'twitch-monitor', status: 'connected' },
            { name: 'discord-monitor', status: 'connected' },  
            { name: 'event-monitor', status: 'connected' }
          ],
          tools: [
            { name: 'elevenlabs', status: 'running', port: 3454 },
            { name: 'semantic-memory', status: 'running' },
            { name: 'rustybutter-avatar', status: 'stopped' },
            { name: 'discord-tools', status: 'stopped' },
            { name: 'twitch-chat', status: 'running', port: 3456 }
          ]
        }
        
        setSystemInfo(systemInfo)
      } catch (error) {
        console.error('Failed to fetch orchestrator status:', error)
        setSystemInfo({
          orchestrator: { status: 'offline', activeLLMs: { claude: 0, others: 0 }, queueSizes: { action: 0, performance: 0, voiceQueue: 0 } },
          monitors: [],
          tools: []
        })
      }
    }
    
    // Initial fetch
    fetchSystemStatus()
    
    // Poll every 5 seconds
    const interval = setInterval(fetchSystemStatus, 5000)
    
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-4">
      {/* Orchestrator Status */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-md">
        <div className="px-4 py-3 border-b border-[#30363d]">
          <h3 className="text-sm font-semibold text-[#e6edf3]">Orchestrator</h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#7d8590]">Status</span>
            <span className={`flex items-center gap-1 text-xs ${systemInfo.orchestrator.status === 'online' ? 'text-[#238636]' : 'text-[#da3633]'}`}>
              <div className={`w-2 h-2 rounded-full ${systemInfo.orchestrator.status === 'online' ? 'bg-[#238636]' : 'bg-[#da3633]'}`}></div>
              {systemInfo.orchestrator.status}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#7d8590]">Claude Instances</span>
            <span className="text-xs text-[#e6edf3]">{systemInfo.orchestrator.activeLLMs.claude}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#7d8590]">Other LLMs</span>
            <span className="text-xs text-[#e6edf3]">{systemInfo.orchestrator.activeLLMs.others}</span>
          </div>
          <div className="pt-2 border-t border-[#30363d]">
            <div className="text-xs text-[#7d8590] mb-2">Queues</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#7d8590]">Action</span>
                <span className="text-xs text-[#58a6ff]">{systemInfo.orchestrator.queueSizes.action}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#7d8590]">Voice</span>
                <span className="text-xs text-[#a5a5ff]">{systemInfo.orchestrator.queueSizes.voiceQueue}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#7d8590]">Performance</span>
                <span className="text-xs text-[#238636]">{systemInfo.orchestrator.queueSizes.performance}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monitors Status */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-md">
        <div className="px-4 py-3 border-b border-[#30363d]">
          <h3 className="text-sm font-semibold text-[#e6edf3]">Monitors</h3>
        </div>
        <div className="p-4 space-y-3">
          {systemInfo.monitors.map((monitor) => (
            <div key={monitor.name} className="flex items-center justify-between">
              <span className="text-xs text-[#7d8590]">{monitor.name}</span>
              <span className={`flex items-center gap-1 text-xs ${monitor.status === 'connected' ? 'text-[#238636]' : 'text-[#da3633]'}`}>
                <div className={`w-2 h-2 rounded-full ${monitor.status === 'connected' ? 'bg-[#238636]' : 'bg-[#da3633]'}`}></div>
                {monitor.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tools Status */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-md">
        <div className="px-4 py-3 border-b border-[#30363d]">
          <h3 className="text-sm font-semibold text-[#e6edf3]">Tools & Services</h3>
        </div>
        <div className="p-4 space-y-3">
          {systemInfo.tools.map((tool) => (
            <div key={tool.name} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#7d8590]">{tool.name}</span>
                <span className={`flex items-center gap-1 text-xs ${
                  tool.status === 'running' ? 'text-[#238636]' : 
                  tool.status === 'stopped' ? 'text-[#d29922]' : 'text-[#da3633]'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    tool.status === 'running' ? 'bg-[#238636]' : 
                    tool.status === 'stopped' ? 'bg-[#d29922]' : 'bg-[#da3633]'
                  }`}></div>
                  {tool.status}
                </span>
              </div>
              {tool.port && (
                <div className="text-xs text-[#656d76] ml-1">:{tool.port}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}