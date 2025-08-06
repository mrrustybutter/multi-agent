'use client'

import { useState, useRef, useEffect } from 'react'
import { useSocket } from '@/hooks/useSocket'

interface Message {
  id: string
  text: string
  sender: 'user' | 'rusty'
  timestamp: Date
  priority?: 'critical' | 'high' | 'normal'
}

export default function PriorityChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [priority, setPriority] = useState<'critical' | 'high' | 'normal'>('high')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const socket = useSocket()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!socket) return

    socket.on('chat:message', (message: Message) => {
      setMessages(prev => [...prev, message])
    })

    return () => {
      socket.off('chat:message')
    }
  }, [socket])

  const sendMessage = async () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: new Date(),
      priority
    }

    // Add user message immediately
    setMessages(prev => [...prev, userMessage])
    const messageText = input
    setInput('')

    try {
      // Send directly to orchestrator API
      const response = await fetch('http://localhost:8742/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'dashboard',
          type: 'chat_message',
          priority: priority === 'critical' ? 'critical' : priority === 'high' ? 'high' : 'medium',
          data: {
            message: messageText,
            user: 'CodingButter',
            isDashboardPriority: true
          }
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        
        // Add confirmation message
        const confirmMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: `✓ Message sent to orchestrator (Event ID: ${result.eventId})`,
          sender: 'rusty',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, confirmMessage])
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: '❌ Failed to send message to orchestrator',
        sender: 'rusty',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    }
  }

  return (
    <div className="flex flex-col h-[550px]">
      <div className="flex-1 overflow-y-auto scrollbar-github space-y-3 mb-4 p-1">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-[#7d8590]">Send a priority message to the orchestrator</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-md px-3 py-2 ${
                message.sender === 'user'
                  ? 'bg-[#0969da] text-white'
                  : 'bg-[#21262d] border border-[#30363d] text-[#e6edf3]'
              }`}
            >
              {message.priority && message.sender === 'user' && (
                <span className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded mb-1 ${
                  message.priority === 'critical' ? 'bg-[#da3633] text-white' :
                  message.priority === 'high' ? 'bg-[#fb8500] text-white' : 'bg-[#656d76] text-white'
                }`}>
                  {message.priority.toUpperCase()}
                </span>
              )}
              <p className="text-sm leading-5">{message.text}</p>
              <div className="text-xs opacity-70 mt-1">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[#30363d] pt-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-xs text-[#7d8590] font-medium">Priority:</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as any)}
            className="bg-[#21262d] border border-[#30363d] text-sm rounded-md px-2 py-1 text-[#e6edf3] focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
          >
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Send a message to the orchestrator..."
            className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#7d8590] focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#656d76] px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}