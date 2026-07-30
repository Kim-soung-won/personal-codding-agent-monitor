import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useWebSocket } from '@/entities/session'
import { useTheme } from '@/shared/lib/useTheme'
import { ChatView } from '@/entities/session'
import { ThinkingViewer } from '@/entities/session'
import { TokenDashboard } from '@/entities/session'
import { ResourcesPanel } from '@/entities/session'
import { WelcomeDashboard } from '@/components/WelcomeDashboard'
import { GlobalAnalytics } from '@/components/GlobalAnalytics'
import { SessionCompare } from '@/features/session-compare'
import { SessionTitleBadge } from '@/entities/session'
import { AppShell } from '@/shared/ui/AppShell'
import { CommitRecordsPage } from '@/pages/CommitRecordsPage'
import { CommitRecordDetailPage } from '@/pages/CommitRecordDetailPage'
import { SubAgentsPage } from '@/pages/SubAgentsPage'
import { PluginsPage } from '@/pages/PluginsPage'
import { SkillsPage } from '@/pages/SkillsPage'
import { cn } from '@/shared/lib/utils'
import { apiFetch } from '@/shared/api/config'
import { calcCostUsd, collectUsage } from '@shared/pricing'
import type { NormalizedEvent, SessionInfo } from '@/entities/session'

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

function formatCost(usd: number): string {
  if (usd < 0.005) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

async function fetchSessionEvents(sessionId: string): Promise<NormalizedEvent[]> {
  const res = await apiFetch(`/api/sessions/${sessionId}/events`)
  const json = await res.json()
  if (!json.success) return []
  return (json.data as NormalizedEvent[])
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
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
        <SessionTitleBadge title={session?.title} description={session?.description} />
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
                {s.title && <p className="text-[11px] font-medium truncate mt-0.5">{s.title}</p>}
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

// ─── Projects list page (레거시 · 로컬 파일 모드 전용) ──────────────────────────

interface ProjectGroup {
  projectEncoded: string
  projectPath: string
  sessionCount: number
  lastModified: number
}

function groupProjects(sessions: SessionInfo[]): ProjectGroup[] {
  const groups = new Map<string, SessionInfo[]>()
  for (const s of sessions) {
    const list = groups.get(s.projectEncoded)
    if (list) {
      list.push(s)
    } else {
      groups.set(s.projectEncoded, [s])
    }
  }
  return [...groups.entries()]
    .map(([projectEncoded, list]) => ({
      projectEncoded,
      projectPath: list[0]?.projectPath ?? '',
      sessionCount: list.length,
      lastModified: Math.max(...list.map(s => s.lastModified)),
    }))
    .sort((a, b) => b.lastModified - a.lastModified)
}

function ProjectsListPage({ sessions }: { sessions: SessionInfo[] }) {
  const navigate = useNavigate()
  const projects = groupProjects(sessions)

  return (
    <>
      <header className="shrink-0 flex items-center gap-3 px-4 border-b h-12">
        <p className="flex-1 text-sm font-medium">프로젝트</p>
        <DarkToggle />
      </header>
      <main className="flex-1 overflow-y-auto p-4">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            프로젝트가 없습니다 — 로컬 파일 모드에서만 표시됩니다.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map(p => (
              <button
                key={p.projectEncoded}
                onClick={() => navigate(`/p/${encodeURIComponent(p.projectEncoded)}`)}
                className="text-left border rounded-md p-3 transition-colors hover:bg-muted/40 hover:border-primary/40"
              >
                <p className="text-sm font-medium truncate">{projectLabel(p.projectPath)}</p>
                <p className="text-xs text-muted-foreground mt-1">{p.sessionCount}개 세션</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {formatSessionTime(p.lastModified)}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </>
  )
}

// ─── Compare page (레거시 · 로컬 파일 모드 전용) ────────────────────────────────

function ComparePage({ sessions }: { sessions: SessionInfo[] }) {
  return (
    <>
      <header className="shrink-0 flex items-center gap-3 px-4 border-b h-12">
        <p className="flex-1 text-sm font-medium">세션 비교</p>
        <DarkToggle />
      </header>
      <main className="flex-1 overflow-y-auto p-4">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            비교할 세션이 없습니다 — 로컬 파일 모드에서만 표시됩니다.
          </p>
        ) : (
          <SessionCompare sessions={sessions} />
        )}
      </main>
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
  // 전역 WS 연결 상태(빈 세션 구독 = 연결 표시용). 셸의 연결 점에 반영.
  const { connected } = useWebSocket([])

  useEffect(() => {
    apiFetch('/api/sessions')
      .then(r => r.json())
      .then(res => { if (res.success) setSessions(res.data) })
      .catch(() => {})
  }, [])

  return (
    <AppShell connected={connected}>
      <Routes>
        {/* 커밋 단위 기록 — 이 제품의 본체 */}
        <Route path="/" element={<CommitRecordsPage />} />
        <Route path="/records/:id" element={<CommitRecordDetailPage />} />
        <Route path="/subagents" element={<SubAgentsPage />} />
        <Route path="/plugins" element={<PluginsPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        {/* 참고자료(구 홈) */}
        <Route path="/reference/pricing" element={<HomePage />} />
        {/* 레거시 뷰(Phase 2b-2에서 대시보드로 대체 예정, 현재 URL로 접근 가능) */}
        <Route path="/projects" element={<ProjectsListPage sessions={sessions} />} />
        <Route path="/compare" element={<ComparePage sessions={sessions} />} />
        <Route path="/analytics" element={<AnalyticsPage sessions={sessions} />} />
        <Route path="/s/:sessionId" element={<Navigate to="chat" replace />} />
        <Route path="/s/:sessionId/:tab" element={<SessionPage sessions={sessions} onConnectedChange={() => {}} />} />
        <Route path="/p/:projectEncoded" element={<Navigate to="resources" replace />} />
        <Route path="/p/:projectEncoded/:tab" element={<ProjectPage sessions={sessions} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
