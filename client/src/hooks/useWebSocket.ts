import { useEffect, useRef, useCallback, useState } from 'react'
import type { WsMessage, NormalizedEvent } from '../types/events'

const WS_URL = 'ws://localhost:3001'
const MAX_BUFFER = 500

export function useWebSocket(sessionId: string | null) {
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      setTimeout(connect, 2000)
    }
    ws.onmessage = (e) => {
      try {
        const msg: WsMessage = JSON.parse(e.data as string)
        if (msg.type !== 'event') return
        const event = msg.payload
        if (sessionId && event.sessionId !== sessionId) return

        setEvents((prev) => {
          const next = [...prev, event]
          return next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next
        })
      } catch {
        // malformed message — skip
      }
    }
  }, [sessionId])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  const clearEvents = useCallback(() => setEvents([]), [])

  return { events, connected, clearEvents }
}
