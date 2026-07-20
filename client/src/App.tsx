import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useWebSocket } from './hooks/useWebSocket'
import { useTheme } from './hooks/useTheme'
import { ChatView } from './components/ChatView'
import { ThinkingViewer } from './components/ThinkingViewer'
import { TokenDashboard } from './components/TokenDashboard'
import { ResourcesPanel } from './components/ResourcesPanel'
import { WelcomeDashboard } from './components/WelcomeDashboard'
import { GlobalAnalytics } from './components/GlobalAnalytics'
import { cn } from './lib/utils'
import { calcCostUsd, collectUsage } from '@shared/pricing'
import type { NormalizedEvent, SessionInfo } from './types/events'

const API_BASE = 'http://localhost:3001'

type SessionTab = 'chat' | 'thinking' | 'tokens' | 'resources'
type ProjectTab = 'thinking' | 'tokens' | 'resources'

const VALID_SESSION_TABS = new Set<string>(['chat', 'thinking', 'tokens', 'resources'])
const VALID_PROJECT_TABS = new Set<string>(['thinking', 'tokens', 'resources'])

const SESSION_TABS: { id: SessionTab; label: string }[] = [
  { id: 'chat',      label: '대화' },
  { id: 'thinking',  label: 'Thinking' },
  { id: 'tokens',    label: 'Tokens' },
  { id: 'resources', label: 'Resources' },
]

const PROJECT_TABS: { id: ProjectTab; label: string }[] = [
  { id: 'thinking',  label: 'Thinking' },
  { id: 'tokens',    label: 'Tokens' },
  { id: 'resources', label: 'Resources' },
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

async function fetchSessionEvents(sessionId: string): Promise<NormalizedEvent[]> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/events`)
  const json = await res.json()
  if (!json.success) return []
  return (json.data as NormalizedEvent[])
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  sessions: SessionInfo[]
  connected: boolean
}

function Sidebar({ sessions, connected }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const projectMatch = location.pathname.match(/^\/p\/([^/]+)/)
  const activeProjectEncoded = projectMatch?.[1]
  const sessionMatch = location.pathname.match(/^\/s\/([^/]+)/)
  const activeSessionId = sessionMatch?.[1]

  // Deduplicated project list, most recent first
  const projects = (() => {
    const seen = new Map<string, SessionInfo>()
    for (const s of sessions) {
      if (!seen.has(s.projectEncoded)) seen.set(s.projectEncoded, s)
    }
    return [...seen.values()].sort((a, b) => b.lastModified - a.lastModified)
  })()

  return (
    <aside
      className="w-56 shrink-0 flex flex-col h-full overflow-hidden"
      style={{
        background: 'hsl(var(--sidebar))',
        borderRight: '1px solid hsl(var(--sidebar-border))',
        color: 'hsl(var(--sidebar-foreground))',
      }}
    >
      {/* Logo */}
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

      {/* Analytics */}
      <div className="px-2 mb-1 shrink-0">
        <button
          onClick={() => navigate('/analytics')}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs font-medium transition-colors',
            location.pathname === '/analytics'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Analytics
        </button>
      </div>

      <div className="mx-3 mb-2 shrink-0" style={{ height: '1px', background: 'hsl(var(--sidebar-border))' }} />

      {/* Flat project list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {projects.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-4 text-center">세션 없음</p>
        )}
        {projects.map(p => {
          const pCount = sessions.filter(s => s.projectEncoded === p.projectEncoded).length
          const isActive = p.projectEncoded === activeProjectEncoded
            || sessions.some(s => s.sessionId === activeSessionId && s.projectEncoded === p.projectEncoded)

          return (
            <button
              key={p.projectEncoded}
              onClick={() => navigate(`/p/${p.projectEncoded}/resources`)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded text-left transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-foreground',
              )}
            >
              <div className="flex-1 min-w-0">
                <p className={cn('text-xs font-medium truncate', isActive ? 'text-primary' : '')}>
                  {projectLabel(p.projectPath)}
                </p>
                {projectSubLabel(p.projectPath) && (
                  <p className="text-[10px] text-muted-foreground truncate">{projectSubLabel(p.projectPath)}</p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{pCount}</span>
            </button>
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

// ─── Shared tab bar ───────────────────────────────────────────────────────────

function TabBar<T extends string>({
  tabs, activeTab, onSelect,
}: {
  tabs: { id: T; label: string }[]
  activeTab: T
  onSelect: (id: T) => void
}) {
  return (
    <div className="shrink-0 border-b flex overflow-x-auto">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
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

  const activeTab = VALID_SESSION_TABS.has(tab) ? (tab as SessionTab) : 'chat'

  const session = sessions.find(s => s.sessionId === sessionId)
  const [historicalEvents, setHistoricalEvents] = useState<NormalizedEvent[]>([])
  const [loading, setLoading] = useState(false)

  const { events: liveEvents, connected } = useWebSocket([sessionId])

  useEffect(() => { onConnectedChange(connected) }, [connected, onConnectedChange])

  useEffect(() => {
    setHistoricalEvents([])
    if (!sessionId) return
    setLoading(true)
    fetchSessionEvents(sessionId)
      .then(evs => setHistoricalEvents(evs.slice(-500)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [sessionId])

  const seenIds = new Set(historicalEvents.map(e => e.id))
  const events = [...historicalEvents, ...liveEvents.filter(e => !seenIds.has(e.id))]

  const projectPath = session
    ? sessions.find(s => s.projectEncoded === session.projectEncoded)?.projectPath ?? ''
    : ''

  return (
    <>
      <header className="shrink-0 flex items-center gap-3 px-4 border-b h-12">
        <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
          {projectPath && (
            <span className="text-muted-foreground truncate max-w-[140px]">{projectLabel(projectPath)}</span>
          )}
          <span className="text-muted-foreground/40">/</span>
          <span className="font-mono text-xs truncate">{sessionId.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {loading
            ? <span className="text-xs text-muted-foreground animate-pulse">로딩 중…</span>
            : <span className="text-xs text-muted-foreground">{events.length}개 이벤트</span>
          }
          <DarkToggle />
        </div>
      </header>

      <TabBar
        tabs={SESSION_TABS}
        activeTab={activeTab}
        onSelect={id => navigate(`/s/${sessionId}/${id}`)}
      />

      <main className="flex-1 overflow-y-auto p-4">
        {activeTab === 'chat'      && <ChatView events={events} />}
        {activeTab === 'thinking'  && <ThinkingViewer events={events} />}
        {activeTab === 'tokens'    && <TokenDashboard events={events} />}
        {activeTab === 'resources' && <ResourcesPanel events={events} />}
      </main>
    </>
  )
}

// ─── ProjectPage ──────────────────────────────────────────────────────────────

interface ProjectPageProps {
  sessions: SessionInfo[]
}

function ProjectPage({ sessions }: ProjectPageProps) {
  const { projectEncoded = '', tab = 'resources' } = useParams<{ projectEncoded: string; tab: string }>()
  const navigate = useNavigate()

  const activeTab = VALID_PROJECT_TABS.has(tab) ? (tab as ProjectTab) : 'resources'

  const projectSessions = sessions
    .filter(s => s.projectEncoded === projectEncoded)
    .sort((a, b) => b.lastModified - a.lastModified)

  const projectPath = projectSessions[0]?.projectPath ?? ''

  const [allEvents, setAllEvents] = useState<NormalizedEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  useEffect(() => {
    setAllEvents([])
    setSelectedSessionId(null)
    if (projectSessions.length === 0) return
    setLoading(true)

    Promise.all(projectSessions.map(s => fetchSessionEvents(s.sessionId).catch(() => [])))
      .then(results => {
        const merged = results
          .flat()
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        const seen = new Set<string>()
        const deduped = merged.filter(e => {
          if (seen.has(e.id)) return false
          seen.add(e.id)
          return true
        })
        setAllEvents(deduped)
      })
      .finally(() => setLoading(false))
  // projectSessions.length: re-run when sessions first load (direct URL navigation)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectEncoded, projectSessions.length])

  // Filter to selected session or show all
  const events = selectedSessionId
    ? allEvents.filter(e => e.sessionId === selectedSessionId)
    : allEvents

  const isAggregate = selectedSessionId === null

  const displayCost = collectUsage(events).reduce(
    (sum, u) => sum + calcCostUsd(u.usage, u.model),
    0,
  )

  return (
    <>
      <header className="shrink-0 flex items-center gap-3 px-4 border-b h-12">
        <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
          <span className="font-medium truncate">{projectLabel(projectPath)}</span>
          <span className="text-muted-foreground/40">/</span>
          {isAggregate ? (
            <span className="text-xs text-muted-foreground shrink-0">전체 {projectSessions.length}개 세션</span>
          ) : (
            <span className="text-xs font-mono text-foreground shrink-0">{selectedSessionId?.slice(0, 8)}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {loading
            ? <span className="text-xs text-muted-foreground animate-pulse">로딩 중…</span>
            : (
              <span className="text-xs text-muted-foreground">
                {events.length}개 이벤트
                {displayCost > 0 && <span className="ml-2 font-mono">{formatCost(displayCost)}</span>}
              </span>
            )
          }
          <DarkToggle />
        </div>
      </header>

      <TabBar
        tabs={PROJECT_TABS}
        activeTab={activeTab}
        onSelect={id => navigate(`/p/${projectEncoded}/${id}`)}
      />

      <div className="flex-1 overflow-hidden flex">
        {/* ── Session picker ── */}
        <div className="w-44 shrink-0 border-r border-border flex flex-col overflow-y-auto">
          {/* Aggregate option */}
          <button
            onClick={() => setSelectedSessionId(null)}
            className={cn(
              'w-full px-3 py-2.5 text-left transition-colors border-b border-border',
              isAggregate
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
            )}
          >
            <p className="text-xs font-medium">전체 집계</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{projectSessions.length}개 세션</p>
          </button>

          {/* Individual sessions */}
          {projectSessions.map(s => {
            const isSelected = s.sessionId === selectedSessionId
            return (
              <button
                key={s.sessionId}
                onClick={() => setSelectedSessionId(s.sessionId)}
                className={cn(
                  'w-full px-3 py-2 text-left transition-colors border-b border-border/40',
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
              >
                <p className="text-xs font-mono truncate">{s.sessionId.slice(0, 8)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatSessionTime(s.lastModified)}</p>
              </button>
            )
          })}
        </div>

        {/* ── Content ── */}
        <main className="flex-1 overflow-y-auto p-4">
          {loading && (
            <p className="text-sm text-muted-foreground animate-pulse py-8 text-center">
              {projectSessions.length}개 세션 로딩 중…
            </p>
          )}
          {!loading && activeTab === 'thinking'  && <ThinkingViewer events={events} />}
          {!loading && activeTab === 'tokens'    && <TokenDashboard events={events} />}
          {!loading && activeTab === 'resources' && (
            <ResourcesPanel events={events} multiSession={isAggregate} />
          )}
        </main>
      </div>
    </>
  )
}

// ─── Analytics page ───────────────────────────────────────────────────────────

function AnalyticsPage({ sessions }: { sessions: SessionInfo[] }) {
  return (
    <>
      <header className="shrink-0 flex items-center gap-3 px-4 border-b h-12">
        <p className="flex-1 text-sm font-medium">전체 Analytics</p>
        <DarkToggle />
      </header>
      <main className="flex-1 overflow-y-auto p-4">
        <GlobalAnalytics sessions={sessions} />
      </main>
    </>
  )
}

// ─── Home page ────────────────────────────────────────────────────────────────

function HomePage() {
  const { dark } = useTheme()
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
  useTheme()
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
          <Route path="/analytics" element={<AnalyticsPage sessions={sessions} />} />
          <Route path="/s/:sessionId" element={<Navigate to="chat" replace />} />
          <Route path="/s/:sessionId/:tab" element={<SessionPage sessions={sessions} onConnectedChange={setConnected} />} />
          <Route path="/p/:projectEncoded" element={<Navigate to="resources" replace />} />
          <Route path="/p/:projectEncoded/:tab" element={<ProjectPage sessions={sessions} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}
