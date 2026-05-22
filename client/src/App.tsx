import { useState, useEffect } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import type { NormalizedEvent, SessionInfo } from './types/events'

const API_BASE = 'http://localhost:3001'

export default function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [historicalEvents, setHistoricalEvents] = useState<NormalizedEvent[]>([])
  const [loading, setLoading] = useState(false)
  const { events: liveEvents, connected, clearEvents } = useWebSocket(selectedSession)

  useEffect(() => {
    fetch(`${API_BASE}/api/sessions`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setSessions(res.data)
      })
      .catch(() => {})
  }, [])

  const handleSessionChange = (sessionId: string) => {
    setSelectedSession(sessionId)
    clearEvents()
    setHistoricalEvents([])

    if (!sessionId) return
    setLoading(true)
    fetch(`${API_BASE}/api/sessions/${sessionId}/events`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setHistoricalEvents(res.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  // 기존 이력 + 실시간 이벤트 합산 (id 기준 중복 제거)
  const seenIds = new Set(historicalEvents.map((e) => e.id))
  const events = [
    ...historicalEvents,
    ...liveEvents.filter((e) => !seenIds.has(e.id)),
  ]

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b px-6 py-3 flex items-center gap-4 shrink-0">
        <h1 className="text-base font-semibold tracking-tight">Claude Code Observer</h1>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-mono ${
            connected
              ? 'bg-green-500/15 text-green-600 dark:text-green-400'
              : 'bg-red-500/15 text-red-600 dark:text-red-400'
          }`}
        >
          {connected ? 'live' : 'disconnected'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <select
            className="text-sm border rounded px-2 py-1 bg-background"
            value={selectedSession ?? ''}
            onChange={(e) => handleSessionChange(e.target.value)}
          >
            <option value="">— 세션 선택 —</option>
            {sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.projectPath.split('/').pop()} / {s.sessionId.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-4">
        <div className="text-sm text-muted-foreground">
          {loading
            ? '이벤트 로딩 중…'
            : `이벤트 ${events.length}개${selectedSession ? ` — ${selectedSession.slice(0, 8)}` : ''}`}
        </div>

        <div className="space-y-1">
          {events.slice().reverse().map((ev) => (
            <div
              key={ev.id}
              className="border rounded px-3 py-2 text-sm font-mono flex items-start gap-3"
            >
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(ev.timestamp).toLocaleTimeString()}
              </span>
              <CategoryBadge category={ev.category} />
              <span className="truncate text-foreground/80">{ev.summary}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    'user-input': 'bg-blue-500/15 text-blue-600',
    thinking: 'bg-purple-500/15 text-purple-600',
    'tool-use': 'bg-orange-500/15 text-orange-600',
    'assistant-text': 'bg-emerald-500/15 text-emerald-600',
    'context-injection': 'bg-yellow-500/15 text-yellow-700',
    'file-edit': 'bg-pink-500/15 text-pink-600',
    system: 'bg-slate-500/15 text-slate-600',
  }
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${colors[category] ?? 'bg-muted text-muted-foreground'}`}
    >
      {category}
    </span>
  )
}
