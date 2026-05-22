import { useState, useEffect, useMemo } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { ThinkingViewer } from './components/ThinkingViewer'
import { Timeline } from './components/Timeline'
import { TokenDashboard } from './components/TokenDashboard'
import { CategoryBadge } from './components/CategoryBadge'
import type { NormalizedEvent, SessionInfo } from './types/events'

const API_BASE = 'http://localhost:3001'

type Tab = 'thinking' | 'timeline' | 'tokens' | 'all'

const TABS: { id: Tab; label: string }[] = [
  { id: 'thinking', label: 'ThinkingViewer' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'tokens', label: 'Token Dashboard' },
  { id: 'all', label: '전체 피드' },
]

function projectLabel(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.slice(-3).join('/')
}

function sessionLabel(s: SessionInfo): string {
  const date = new Date(s.lastModified).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${s.sessionId.slice(0, 8)} · ${date}`
}

export default function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [historicalEvents, setHistoricalEvents] = useState<NormalizedEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('thinking')

  useEffect(() => {
    fetch(`${API_BASE}/api/sessions`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setSessions(res.data)
      })
      .catch(() => {})
  }, [])

  const projects = useMemo(() => {
    const seen = new Map<string, SessionInfo>()
    for (const s of sessions) {
      if (!seen.has(s.projectEncoded)) seen.set(s.projectEncoded, s)
    }
    return [...seen.values()].sort((a, b) =>
      a.projectPath.localeCompare(b.projectPath),
    )
  }, [sessions])

  const projectSessions = useMemo(
    () => sessions.filter((s) => s.projectEncoded === selectedProject),
    [sessions, selectedProject],
  )

  // 실제로 구독/조회할 세션 ID 목록
  // - 세션 선택 시: 해당 세션만
  // - 프로젝트만 선택 시: 프로젝트 내 전체 세션
  const activeSessionIds = useMemo(() => {
    if (selectedSession) return [selectedSession]
    if (selectedProject) return projectSessions.map((s) => s.sessionId)
    return []
  }, [selectedSession, selectedProject, projectSessions])

  const { events: liveEvents, connected, clearEvents } = useWebSocket(activeSessionIds)

  // activeSessionIds 변경 시 이력 새로 로드
  useEffect(() => {
    clearEvents()
    setHistoricalEvents([])
    if (activeSessionIds.length === 0) return

    setLoading(true)
    Promise.all(
      activeSessionIds.map((id) =>
        fetch(`${API_BASE}/api/sessions/${id}/events`)
          .then((r) => r.json())
          .then((res) => (res.success ? (res.data as NormalizedEvent[]) : []))
          .catch(() => [] as NormalizedEvent[]),
      ),
    )
      .then((results) => {
        const merged = results
          .flat()
          .sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          )
        setHistoricalEvents(merged.slice(-500))
      })
      .finally(() => setLoading(false))
  }, [activeSessionIds, clearEvents])

  const handleProjectChange = (encoded: string) => {
    setSelectedProject(encoded || null)
    setSelectedSession(null)
  }

  const handleSessionChange = (sessionId: string) => {
    setSelectedSession(sessionId || null)
  }

  const seenIds = new Set(historicalEvents.map((e) => e.id))
  const events = [
    ...historicalEvents,
    ...liveEvents.filter((e) => !seenIds.has(e.id)),
  ]

  const isProjectMode = selectedProject && !selectedSession

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b px-6 py-3 flex items-center gap-3 shrink-0">
        <h1 className="text-base font-semibold tracking-tight">Claude Code Observer</h1>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-mono ${
            connected ? 'bg-green-500/15 text-green-600' : 'bg-red-500/15 text-red-600'
          }`}
        >
          {connected ? 'live' : 'disconnected'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {loading && <span className="text-xs text-muted-foreground">로딩 중…</span>}
          {!loading && activeSessionIds.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {events.length}개
              {isProjectMode && projectSessions.length > 1 && (
                <span className="opacity-60"> / {projectSessions.length}개 세션</span>
              )}
            </span>
          )}

          {/* 프로젝트 선택 */}
          <select
            className="text-sm border rounded px-2 py-1 bg-background max-w-[200px]"
            value={selectedProject ?? ''}
            onChange={(e) => handleProjectChange(e.target.value)}
          >
            <option value="">— 프로젝트 —</option>
            {projects.map((p) => (
              <option key={p.projectEncoded} value={p.projectEncoded}>
                {projectLabel(p.projectPath)}
              </option>
            ))}
          </select>

          {/* 세션 선택 — 프로젝트 선택 후 활성화 */}
          <select
            className="text-sm border rounded px-2 py-1 bg-background max-w-[200px] disabled:opacity-40"
            value={selectedSession ?? ''}
            onChange={(e) => handleSessionChange(e.target.value)}
            disabled={!selectedProject}
          >
            <option value="">— 전체 세션 —</option>
            {projectSessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {sessionLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="border-b px-6 flex gap-0 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-sm px-4 py-2.5 border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'thinking' && <ThinkingViewer events={events} />}
        {activeTab === 'timeline' && <Timeline events={events} />}
        {activeTab === 'tokens' && <TokenDashboard events={events} />}
        {activeTab === 'all' && <AllEventsFeed events={events} />}
      </main>
    </div>
  )
}

function AllEventsFeed({ events }: { events: NormalizedEvent[] }) {
  return (
    <div className="space-y-1">
      {events.length === 0 && (
        <p className="text-sm text-muted-foreground py-12 text-center">이벤트 없음</p>
      )}
      {events
        .slice()
        .reverse()
        .map((ev) => (
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
  )
}
