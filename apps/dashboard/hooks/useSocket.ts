import { useEffect, useState } from 'react'
import io, { Socket } from 'socket.io-client'

export function useSocket(): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    // Only create socket in browser environment after hydration
    if (typeof window === 'undefined') return

    const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3458', {
      transports: ['websocket'],
      autoConnect: true
    })

    newSocket.on('connect', () => {
      console.log('Connected to dashboard server')
      setIsConnected(true)
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from dashboard server')
      setIsConnected(false)
    })

    setSocket(newSocket)

    return () => {
      if (newSocket.connected) {
        newSocket.disconnect()
      }
    }
  }, [])

  return socket
}