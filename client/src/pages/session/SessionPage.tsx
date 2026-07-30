import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useWebSocket,
  sessionQueries,
  projectLabel,
  ChatView,
  ThinkingViewer,
  TokenDashboard,
  ResourcesPanel,
  SessionTitleBadge,
  type SessionInfo,
} from '@/entities/session'
import { DarkToggle } from '@/shared/ui/DarkToggle'
import { TabBar } from '@/shared/ui/TabBar'

type SessionTab = 'chat' | 'thinking' | 'tokens' | 'resources'

const VALID_SESSION_TABS = new Set<string>(['chat', 'thinking', 'tokens', 'resources'])

const SESSION_TABS: { id: SessionTab; label: string }[] = [
  { id: 'chat',      label: '대화' },
  { id: 'thinking',  label: 'Thinking' },
  { id: 'tokens',    label: 'Tokens' },
  { id: 'resources', label: 'Resources' },
]

interface SessionPageProps {
  sessions: SessionInfo[]
  onConnectedChange: (v: boolean) => void
}

export function SessionPage({ sessions, onConnectedChange }: SessionPageProps) {
  const { sessionId = '', tab = 'chat' } = useParams<{ sessionId: string; tab: string }>()
  const navigate = useNavigate()

  const activeTab = VALID_SESSION_TABS.has(tab) ? (tab as SessionTab) : 'chat'

  const session = sessions.find(s => s.sessionId === sessionId)

  const { events: liveEvents, connected } = useWebSocket([sessionId])

  useEffect(() => { onConnectedChange(connected) }, [connected, onConnectedChange])

  const { data: fetched = [], isPending } = useQuery({
    ...sessionQueries.events(sessionId),
    enabled: !!sessionId,
  })
  const loading = !!sessionId && isPending
  // 히스토리는 최근 500개만. 라이브 이벤트는 중복 제거 후 뒤에 append.
  const historicalEvents = fetched.slice(-500)
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
