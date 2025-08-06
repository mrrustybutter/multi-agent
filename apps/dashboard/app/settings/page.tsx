'use client'

import { useState, useEffect } from 'react'
import { Settings, Save, AlertCircle, Check, Volume2, Mic, Brain, Code, Globe, Shield, Database, Zap, Bell, Eye, EyeOff } from 'lucide-react'

interface SystemSettings {
  llmProviders: {
    openai: { enabled: boolean; apiKey: string; model: string }
    claude: { enabled: boolean; apiKey: string; model: string }
    gemini: { enabled: boolean; apiKey: string; model: string }
    grok: { enabled: boolean; apiKey: string; model: string }
    groq: { enabled: boolean; apiKey: string; model: string }
  }
  audio: {
    elevenLabsEnabled: boolean
    elevenLabsApiKey: string
    voiceId: string
    playbackDevice: string
    volume: number
  }
  memory: {
    enabled: boolean
    autoStore: boolean
    retentionDays: number
    maxMemoriesPerBank: number
  }
  monitoring: {
    discordEnabled: boolean
    twitchEnabled: boolean
    socialEnabled: boolean
    eventMonitorEnabled: boolean
  }
  performance: {
    maxConcurrency: number
    queueSize: number
    timeout: number
    retryAttempts: number
  }
  notifications: {
    errors: boolean
    warnings: boolean
    info: boolean
    sound: boolean
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>({
    llmProviders: {
      openai: { enabled: true, apiKey: '••••••••', model: 'gpt-4-turbo' },
      claude: { enabled: true, apiKey: '••••••••', model: 'claude-3-opus' },
      gemini: { enabled: false, apiKey: '', model: 'gemini-pro' },
      grok: { enabled: false, apiKey: '', model: 'grok-beta' },
      groq: { enabled: false, apiKey: '', model: 'llama2-70b' }
    },
    audio: {
      elevenLabsEnabled: true,
      elevenLabsApiKey: '••••••••',
      voiceId: 'Au8OOcCmvsCaQpmULvvQ',
      playbackDevice: 'default',
      volume: 80
    },
    memory: {
      enabled: true,
      autoStore: true,
      retentionDays: 30,
      maxMemoriesPerBank: 10000
    },
    monitoring: {
      discordEnabled: true,
      twitchEnabled: true,
      socialEnabled: false,
      eventMonitorEnabled: true
    },
    performance: {
      maxConcurrency: 5,
      queueSize: 100,
      timeout: 30000,
      retryAttempts: 3
    },
    notifications: {
      errors: true,
      warnings: true,
      info: false,
      sound: true
    }
  })
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showApiKeys, setShowApiKeys] = useState(false)
  const [activeTab, setActiveTab] = useState<'llm' | 'audio' | 'memory' | 'monitoring' | 'performance' | 'notifications'>('llm')

  useEffect(() => {
    // Load settings from localStorage or API
    const savedSettings = localStorage.getItem('systemSettings')
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings))
    }
  }, [])

  const handleSave = async () => {
    setSaveStatus('saving')
    try {
      // Save to localStorage for persistence
      localStorage.setItem('systemSettings', JSON.stringify(settings))
      
      // Also try to save to API
      try {
        const response = await fetch('http://localhost:8742/api/config/system', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        })
        if (!response.ok) {
          console.warn('Failed to save to API, but localStorage succeeded')
        }
      } catch (apiError) {
        console.warn('API not available, settings saved locally only:', apiError)
      }
      
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (error) {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  const updateSetting = (path: string[], value: any) => {
    setSettings(prev => {
      const newSettings = { ...prev }
      let current: any = newSettings
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]]
      }
      current[path[path.length - 1]] = value
      return newSettings
    })
  }

  const tabs = [
    { id: 'llm', label: 'LLM Providers', icon: Brain },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'memory', label: 'Memory', icon: Database },
    { id: 'monitoring', label: 'Monitoring', icon: Eye },
    { id: 'performance', label: 'Performance', icon: Zap },
    { id: 'notifications', label: 'Notifications', icon: Bell }
  ]

  return (
    <div className="min-h-screen bg-[#0d1117] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#e6edf3] flex items-center gap-2">
            <Settings className="h-6 w-6 text-[#58a6ff]" />
            System Settings
          </h1>
          <p className="text-[#7d8590] text-sm mt-1">
            Configure your multi-agent system preferences
          </p>
        </div>

        {/* Save Status */}
        {saveStatus !== 'idle' && (
          <div className={`mb-4 p-3 rounded-md border flex items-center gap-2 text-sm ${
            saveStatus === 'saving' ? 'bg-[#0969da]/10 border-[#0969da]/20 text-[#58a6ff]' :
            saveStatus === 'saved' ? 'bg-[#238636]/10 border-[#238636]/20 text-[#3fb950]' :
            'bg-[#f85149]/10 border-[#f85149]/20 text-[#f85149]'
          }`}>
            {saveStatus === 'saving' && <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />}
            {saveStatus === 'saved' && <Check className="h-4 w-4" />}
            {saveStatus === 'error' && <AlertCircle className="h-4 w-4" />}
            <span>
              {saveStatus === 'saving' ? 'Saving settings...' :
               saveStatus === 'saved' ? 'Settings saved successfully!' :
               'Failed to save settings'}
            </span>
          </div>
        )}

        <div className="flex gap-6">
          {/* Sidebar Tabs */}
          <div className="w-64">
            <div className="bg-[#161b22] border border-[#30363d] rounded-md p-2">
              {tabs.map(tab => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'bg-[#0969da] text-white'
                        : 'hover:bg-[#21262d] text-[#7d8590] hover:text-[#e6edf3]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={handleSave}
              className="w-full mt-4 px-4 py-2 bg-[#238636] text-white rounded-md hover:bg-[#2ea043] transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Save className="h-4 w-4" />
              Save Settings
            </button>
          </div>

          {/* Settings Content */}
          <div className="flex-1 bg-[#161b22] border border-[#30363d] rounded-md p-6">
            {/* LLM Providers */}
            {activeTab === 'llm' && (
              <div>
                <h2 className="text-lg font-semibold text-[#e6edf3] mb-4">LLM Provider Configuration</h2>
                
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setShowApiKeys(!showApiKeys)}
                    className="flex items-center gap-2 text-xs text-[#7d8590] hover:text-[#58a6ff] transition-colors"
                  >
                    {showApiKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showApiKeys ? 'Hide' : 'Show'} API Keys
                  </button>
                </div>

                <div className="space-y-4">
                  {Object.entries(settings.llmProviders).map(([provider, config]) => (
                    <div key={provider} className="bg-[#0d1117] border border-[#30363d] rounded-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium capitalize text-[#e6edf3] text-sm">{provider}</h3>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(e) => updateSetting(['llmProviders', provider, 'enabled'], e.target.checked)}
                            className="rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#0969da]"
                          />
                          <span className="text-xs text-[#7d8590]">Enabled</span>
                        </label>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-[#7d8590] mb-1">API Key</label>
                          <input
                            type={showApiKeys ? 'text' : 'password'}
                            value={config.apiKey}
                            onChange={(e) => updateSetting(['llmProviders', provider, 'apiKey'], e.target.value)}
                            className="w-full px-3 py-1.5 rounded-md border border-[#30363d] bg-[#0d1117] text-[#e6edf3] text-sm focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
                            placeholder="Enter API key"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#7d8590] mb-1">Model</label>
                          <input
                            type="text"
                            value={config.model}
                            onChange={(e) => updateSetting(['llmProviders', provider, 'model'], e.target.value)}
                            className="w-full px-3 py-1.5 rounded-md border border-[#30363d] bg-[#0d1117] text-[#e6edf3] text-sm focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Audio Settings */}
            {activeTab === 'audio' && (
              <div>
                <h2 className="text-lg font-semibold text-[#e6edf3] mb-4">Audio Configuration</h2>
                
                <div className="space-y-6">
                  <div>
                    <label className="flex items-center gap-2 mb-4">
                      <input
                        type="checkbox"
                        checked={settings.audio.elevenLabsEnabled}
                        onChange={(e) => updateSetting(['audio', 'elevenLabsEnabled'], e.target.checked)}
                        className="rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#0969da]"
                      />
                      <span className="text-sm text-[#e6edf3]">Enable ElevenLabs Text-to-Speech</span>
                    </label>
                    
                    {settings.audio.elevenLabsEnabled && (
                      <div className="space-y-4 pl-6 border-l-2 border-[#30363d]">
                        <div>
                          <label className="block text-xs text-[#7d8590] mb-1">ElevenLabs API Key</label>
                          <input
                            type={showApiKeys ? 'text' : 'password'}
                            value={settings.audio.elevenLabsApiKey}
                            onChange={(e) => updateSetting(['audio', 'elevenLabsApiKey'], e.target.value)}
                            className="w-full px-3 py-1.5 rounded-md border border-[#30363d] bg-[#0d1117] text-[#e6edf3] text-sm focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs text-[#7d8590] mb-1">Voice ID</label>
                          <input
                            type="text"
                            value={settings.audio.voiceId}
                            onChange={(e) => updateSetting(['audio', 'voiceId'], e.target.value)}
                            className="w-full px-3 py-1.5 rounded-md border border-[#30363d] bg-[#0d1117] text-[#e6edf3] text-sm focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
                          />
                          <p className="text-[10px] text-[#7d8590] mt-1">Rusty's voice: Au8OOcCmvsCaQpmULvvQ</p>
                        </div>
                        
                        <div>
                          <label className="block text-xs text-[#7d8590] mb-1">
                            Volume: <span className="text-[#e6edf3]">{settings.audio.volume}%</span>
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={settings.audio.volume}
                            onChange={(e) => updateSetting(['audio', 'volume'], parseInt(e.target.value))}
                            className="w-full accent-[#0969da]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Memory Settings */}
            {activeTab === 'memory' && (
              <div>
                <h2 className="text-lg font-semibold text-[#e6edf3] mb-4">Semantic Memory Configuration</h2>
                
                <div className="space-y-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.memory.enabled}
                      onChange={(e) => updateSetting(['memory', 'enabled'], e.target.checked)}
                      className="rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#0969da]"
                    />
                    <span className="text-sm text-[#e6edf3]">Enable Semantic Memory</span>
                  </label>
                  
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.memory.autoStore}
                      onChange={(e) => updateSetting(['memory', 'autoStore'], e.target.checked)}
                      className="rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#0969da]"
                    />
                    <span className="text-sm text-[#e6edf3]">Automatically store interactions</span>
                  </label>
                  
                  <div>
                    <label className="block text-xs text-[#7d8590] mb-1">
                      Retention Period (days)
                    </label>
                    <input
                      type="number"
                      value={settings.memory.retentionDays}
                      onChange={(e) => updateSetting(['memory', 'retentionDays'], parseInt(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-md border border-[#30363d] bg-[#0d1117] text-[#e6edf3] text-sm focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-[#7d8590] mb-1">
                      Max Memories Per Bank
                    </label>
                    <input
                      type="number"
                      value={settings.memory.maxMemoriesPerBank}
                      onChange={(e) => updateSetting(['memory', 'maxMemoriesPerBank'], parseInt(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-md border border-[#30363d] bg-[#0d1117] text-[#e6edf3] text-sm focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Monitoring Settings */}
            {activeTab === 'monitoring' && (
              <div>
                <h2 className="text-lg font-semibold text-[#e6edf3] mb-4">Monitor Configuration</h2>
                
                <div className="space-y-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.monitoring.discordEnabled}
                      onChange={(e) => updateSetting(['monitoring', 'discordEnabled'], e.target.checked)}
                      className="rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#0969da]"
                    />
                    <span className="text-sm text-[#e6edf3]">Discord Monitor</span>
                  </label>
                  
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.monitoring.twitchEnabled}
                      onChange={(e) => updateSetting(['monitoring', 'twitchEnabled'], e.target.checked)}
                      className="rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#0969da]"
                    />
                    <span className="text-sm text-[#e6edf3]">Twitch Monitor</span>
                  </label>
                  
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.monitoring.socialEnabled}
                      onChange={(e) => updateSetting(['monitoring', 'socialEnabled'], e.target.checked)}
                      className="rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#0969da]"
                    />
                    <span className="text-sm text-[#e6edf3]">Social Media Monitor</span>
                  </label>
                  
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.monitoring.eventMonitorEnabled}
                      onChange={(e) => updateSetting(['monitoring', 'eventMonitorEnabled'], e.target.checked)}
                      className="rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#0969da]"
                    />
                    <span className="text-sm text-[#e6edf3]">Event Monitor</span>
                  </label>
                </div>
              </div>
            )}

            {/* Performance Settings */}
            {activeTab === 'performance' && (
              <div>
                <h2 className="text-lg font-semibold text-[#e6edf3] mb-4">Performance Configuration</h2>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs text-[#7d8590] mb-1">
                      Max Concurrency
                    </label>
                    <input
                      type="number"
                      value={settings.performance.maxConcurrency}
                      onChange={(e) => updateSetting(['performance', 'maxConcurrency'], parseInt(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-md border border-[#30363d] bg-[#0d1117] text-[#e6edf3] text-sm focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
                    />
                    <p className="text-[10px] text-[#7d8590] mt-1">Maximum concurrent operations</p>
                  </div>
                  
                  <div>
                    <label className="block text-xs text-[#7d8590] mb-1">
                      Queue Size
                    </label>
                    <input
                      type="number"
                      value={settings.performance.queueSize}
                      onChange={(e) => updateSetting(['performance', 'queueSize'], parseInt(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-md border border-[#30363d] bg-[#0d1117] text-[#e6edf3] text-sm focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-[#7d8590] mb-1">
                      Timeout (ms)
                    </label>
                    <input
                      type="number"
                      value={settings.performance.timeout}
                      onChange={(e) => updateSetting(['performance', 'timeout'], parseInt(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-md border border-[#30363d] bg-[#0d1117] text-[#e6edf3] text-sm focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-[#7d8590] mb-1">
                      Retry Attempts
                    </label>
                    <input
                      type="number"
                      value={settings.performance.retryAttempts}
                      onChange={(e) => updateSetting(['performance', 'retryAttempts'], parseInt(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-md border border-[#30363d] bg-[#0d1117] text-[#e6edf3] text-sm focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notification Settings */}
            {activeTab === 'notifications' && (
              <div>
                <h2 className="text-lg font-semibold text-[#e6edf3] mb-4">Notification Preferences</h2>
                
                <div className="space-y-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.notifications.errors}
                      onChange={(e) => updateSetting(['notifications', 'errors'], e.target.checked)}
                      className="rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#0969da]"
                    />
                    <span className="text-sm text-[#e6edf3]">Show error notifications</span>
                  </label>
                  
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.notifications.warnings}
                      onChange={(e) => updateSetting(['notifications', 'warnings'], e.target.checked)}
                      className="rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#0969da]"
                    />
                    <span className="text-sm text-[#e6edf3]">Show warning notifications</span>
                  </label>
                  
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.notifications.info}
                      onChange={(e) => updateSetting(['notifications', 'info'], e.target.checked)}
                      className="rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#0969da]"
                    />
                    <span className="text-sm text-[#e6edf3]">Show info notifications</span>
                  </label>
                  
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.notifications.sound}
                      onChange={(e) => updateSetting(['notifications', 'sound'], e.target.checked)}
                      className="rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff] focus:ring-[#0969da]"
                    />
                    <span className="text-sm text-[#e6edf3]">Play notification sounds</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}