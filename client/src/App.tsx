import { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useWebSocket } from './hooks/useWebSocket'
import { useTheme } from './hooks/useTheme'
import { ChatView } from './components/ChatView'
import { ThinkingViewer } from './components/ThinkingViewer'
import { TokenDashboard } from './components/TokenDashboard'
import { ToolStats } from './components/ToolStats'
import { WelcomeDashboard } from './components/WelcomeDashboard'
import { cn } from './lib/utils'
import type { NormalizedEvent, SessionInfo } from './types/events'

const API_BASE = 'http://localhost:3001'

type Tab = 'chat' | 'thinking' | 'tokens' | 'tool-stats'
const VALID_TABS = new Set<string>(['chat', 'thinking', 'tokens', 'tool-stats'])

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat',       label: '대화' },
  { id: 'thinking',   label: 'Thinking' },
  { id: 'tokens',     label: 'Tokens' },
  { id: 'tool-stats', label: 'Tools' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSessionTime(ms: number): string {
  return new Date(ms).toLocaleDateString('ko-KR', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function projectLabel(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function projectSubLabel(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.slice(-3, -1).join('/') || ''
}

function formatCost(usd: number): string {
  if (usd < 0.005) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  sessions: SessionInfo[]
  connected: boolean
}

function Sidebar({ sessions, connected }: SidebarProps) {
  const navigate = useNavigate()
  const { sessionId: activeSessionId } = useParams<{ sessionId?: string }>()

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [sessionCosts, setSessionCosts] = useState<Record<string, number>>({})
  const fetchingRef = useRef<Set<string>>(new Set())

  // Group sessions by project (most recent first)
  const projects = (() => {
    const seen = new Map<string, SessionInfo>()
    for (const s of sessions) {
      if (!seen.has(s.projectEncoded)) seen.set(s.projectEncoded, s)
    }
    return [...seen.values()].sort((a, b) => b.lastModified - a.lastModified)
  })()

  // Auto-expand the project of the active session
  useEffect(() => {
    if (!activeSessionId) return
    const session = sessions.find(s => s.sessionId === activeSessionId)
    if (session) {
      setExpandedProjects(prev => new Set([...prev, session.projectEncoded]))
    }
  }, [activeSessionId, sessions])

  const fetchCosts = useCallback((sessionIds: string[]) => {
    const toFetch = sessionIds.filter(
      id => !(id in sessionCosts) && !fetchingRef.current.has(id),
    )
    if (toFetch.length === 0) return
    for (const id of toFetch) fetchingRef.current.add(id)

    Promise.all(
      toFetch.map(id =>
        fetch(`${API_BASE}/api/sessions/${id}/cost`)
          .then(r => r.json())
          .then(res => [id, res.success ? (res.data.estimatedCostUsd as number) : null] as const)
          .catch(() => [id, null] as const),
      ),
    ).then(entries => {
      const valid = entries.filter((e): e is [string, number] => e[1] !== null)
      if (valid.length > 0) {
        setSessionCosts(prev => ({ ...prev, ...Object.fromEntries(valid) }))
      }
      for (const [id] of entries) fetchingRef.current.delete(id)
    })
  }, [sessionCosts])

  const toggleProject = (encoded: string) => {
    const willExpand = !expandedProjects.has(encoded)
    setExpandedProjects(prev => {
      const next = new Set(prev)
      next.has(encoded) ? next.delete(encoded) : next.add(encoded)
      return next
    })
    if (willExpand) {
      const ids = sessions.filter(s => s.projectEncoded === encoded).map(s => s.sessionId)
      fetchCosts(ids)
    }
  }

  const projectSessions = (encoded: string) =>
    sessions.filter(s => s.projectEncoded === encoded)
      .sort((a, b) => b.lastModified - a.lastModified)

  return (
    <aside
      className="w-60 shrink-0 flex flex-col h-full overflow-hidden"
      style={{
        background: 'hsl(var(--sidebar))',
        borderRight: '1px solid hsl(var(--sidebar-border))',
        color: 'hsl(var(--sidebar-foreground))',
      }}
    >
      {/* Logo — 클릭 시 홈으로 */}
      <button
        onClick={() => navigate('/')}
        className="px-4 py-4 flex items-center gap-2.5 shrink-0 hover:bg-muted/30 transition-colors text-left w-full"
      >
        <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary">C</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-none">Claude Observer</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Session Monitor</p>
        </div>
        <div
          className={cn('ml-auto w-2 h-2 rounded-full shrink-0', connected ? 'bg-green-500' : 'bg-red-400')}
          title={connected ? 'Connected' : 'Disconnected'}
        />
      </button>

      <div className="mx-3 mb-2 shrink-0" style={{ height: '1px', background: 'hsl(var(--sidebar-border))' }} />

      {/* Session tree */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {projects.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-4 text-center">세션 없음</p>
        )}
        {projects.map(p => {
          const isExpanded = expandedProjects.has(p.projectEncoded)
          const pSessions = projectSessions(p.projectEncoded)
          const hasActive = pSessions.some(s => s.sessionId === activeSessionId)

          return (
            <div key={p.projectEncoded} className="mb-0.5">
              <button
                onClick={() => toggleProject(p.projectEncoded)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors',
                  hasActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-foreground',
                )}
              >
                <span className="text-[10px] text-muted-foreground w-3 shrink-0">
                  {isExpanded ? '▼' : '▶'}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{projectLabel(p.projectPath)}</p>
                  {projectSubLabel(p.projectPath) && (
                    <p className="text-[10px] text-muted-foreground truncate">{projectSubLabel(p.projectPath)}</p>
                  )}
                </div>
                <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{pSessions.length}</span>
              </button>

              {isExpanded && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
                  {pSessions.map(s => {
                    const isSelected = s.sessionId === activeSessionId
                    return (
                      <button
                        key={s.sessionId}
                        onClick={() => navigate(`/s/${s.sessionId}/chat`)}
                        className={cn(
                          'w-full flex items-center gap-1 px-2 py-1.5 rounded text-left transition-colors',
                          isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-muted/50 text-foreground',
                        )}
                      >
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-xs font-mono truncate">{s.sessionId.slice(0, 8)}</span>
                          <span className="text-[10px] text-muted-foreground">{formatSessionTime(s.lastModified)}</span>
                        </div>
                        <span className="text-[10px] font-mono shrink-0 tabular-nums text-muted-foreground">
                          {s.sessionId in sessionCosts ? formatCost(sessionCosts[s.sessionId]) : '…'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

// ─── Dark mode toggle ─────────────────────────────────────────────────────────

function DarkToggle() {
  const { dark, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      title={dark ? '라이트 모드' : '다크 모드'}
    >
      {dark ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="5" />
          <path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  )
}

// ─── SessionPage ──────────────────────────────────────────────────────────────

interface SessionPageProps {
  sessions: SessionInfo[]
  onConnectedChange: (v: boolean) => void
}

function SessionPage({ sessions, onConnectedChange }: SessionPageProps) {
  const { sessionId = '', tab = 'chat' } = useParams<{ sessionId: string; tab: string }>()
  const navigate = useNavigate()

  // Validate tab param
  const activeTab = VALID_TABS.has(tab) ? (tab as Tab) : 'chat'
  if (tab !== activeTab) {
    // silent redirect handled by route below
  }

  const session = sessions.find(s => s.sessionId === sessionId)
  const [historicalEvents, setHistoricalEvents] = useState<NormalizedEvent[]>([])
  const [loading, setLoading] = useState(false)

  const { events: liveEvents, connected } = useWebSocket([sessionId])

  useEffect(() => {
    onConnectedChange(connected)
  }, [connected, onConnectedChange])

  useEffect(() => {
    setHistoricalEvents([])
    if (!sessionId) return
    setLoading(true)
    fetch(`${API_BASE}/api/sessions/${sessionId}/events`)
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          const sorted = (res.data as NormalizedEvent[])
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          setHistoricalEvents(sorted.slice(-500))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [sessionId])

  const seenIds = new Set(historicalEvents.map(e => e.id))
  const events = [
    ...historicalEvents,
    ...liveEvents.filter(e => !seenIds.has(e.id)),
  ]

  const projectPath = session
    ? sessions.find(s => s.projectEncoded === session.projectEncoded)?.projectPath ?? ''
    : ''

  return (
    <>
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-4 border-b h-12">
        <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
          {projectPath && (
            <span className="text-muted-foreground truncate max-w-[140px]">
              {projectLabel(projectPath)}
            </span>
          )}
          <span className="text-muted-foreground/40">/</span>
          <span className="font-mono text-xs truncate">{sessionId.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {loading && <span className="text-xs text-muted-foreground animate-pulse">로딩 중…</span>}
          {!loading && (
            <span className="text-xs text-muted-foreground">{events.length}개 이벤트</span>
          )}
          <DarkToggle />
        </div>
      </header>

      {/* Tab bar */}
      <div className="shrink-0 border-b flex overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => navigate(`/s/${sessionId}/${t.id}`)}
            className={cn(
              'px-4 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors',
              activeTab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4">
        {activeTab === 'chat'       && <ChatView events={events} />}
        {activeTab === 'thinking'   && <ThinkingViewer events={events} />}
        {activeTab === 'tokens'     && <TokenDashboard events={events} />}
        {activeTab === 'tool-stats' && <ToolStats events={events} />}
      </main>
    </>
  )
}

// ─── Home page ────────────────────────────────────────────────────────────────

function HomePage() {
  const { dark } = useTheme()   // just to keep theme hook alive at top level
  void dark
  return (
    <>
      <header className="shrink-0 flex items-center justify-end gap-3 px-4 border-b h-12">
        <DarkToggle />
      </header>
      <main className="flex-1 overflow-y-auto p-4">
        <WelcomeDashboard />
      </main>
    </>
  )
}

// ─── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  useTheme()   // initialize theme on mount (applies dark class to <html>)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/sessions`)
      .then(r => r.json())
      .then(res => { if (res.success) setSessions(res.data) })
      .catch(() => {})
  }, [])

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      <Sidebar sessions={sessions} connected={connected} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/s/:sessionId" element={<Navigate to="chat" replace />} />
          <Route
            path="/s/:sessionId/:tab"
            element={
              <SessionPage
                sessions={sessions}
                onConnectedChange={setConnected}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}
