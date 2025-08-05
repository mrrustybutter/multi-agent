import { useEffect, useState } from 'react'
import io, { Socket } from 'socket.io-client'

let socket: Socket | null = null

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!socket) {
      socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3458', {
        transports: ['websocket'],
        autoConnect: true
      })

      socket.on('connect', () => {
        console.log('Connected to dashboard server')
        setIsConnected(true)
      })

      socket.on('disconnect', () => {
        console.log('Disconnected from dashboard server')
        setIsConnected(false)
      })
    }

    return () => {
      if (socket && socket.connected) {
        socket.disconnect()
        socket = null
      }
    }
  }, [])

  return socket
}