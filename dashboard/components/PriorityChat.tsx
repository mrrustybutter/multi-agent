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

  const sendMessage = () => {
    if (!input.trim() || !socket) return

    const message: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: new Date(),
      priority
    }

    socket.emit('chat:send', {
      text: input,
      priority,
      source: 'dashboard',
      user: 'CodingButter'
    })

    setMessages(prev => [...prev, message])
    setInput('')
  }

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                message.sender === 'user'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              {message.priority && message.sender === 'user' && (
                <span className={`text-xs font-semibold mb-1 block ${
                  message.priority === 'critical' ? 'text-red-300' :
                  message.priority === 'high' ? 'text-yellow-300' : 'text-gray-300'
                }`}>
                  [{message.priority.toUpperCase()}]
                </span>
              )}
              <p className="text-sm">{message.text}</p>
              <span className="text-xs opacity-60 mt-1 block">
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-800 pt-4">
        <div className="flex items-center space-x-2 mb-2">
          <label className="text-sm text-gray-400">Priority:</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as any)}
            className="bg-gray-800 text-sm rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type your message..."
            className="flex-1 bg-gray-800 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            onClick={sendMessage}
            className="bg-orange-600 hover:bg-orange-700 px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}