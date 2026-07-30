import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  sessionQueries,
  projectLabel,
  formatSessionTime,
  ThinkingViewer,
  TokenDashboard,
  ResourcesPanel,
  type SessionInfo,
} from '@/entities/session'
import { DarkToggle } from '@/shared/ui/DarkToggle'
import { TabBar } from '@/shared/ui/TabBar'
import { cn } from '@/shared/lib/utils'
import { calcCostUsd, collectUsage } from '@shared/pricing'

type ProjectTab = 'thinking' | 'tokens' | 'resources'

const VALID_PROJECT_TABS = new Set<string>(['thinking', 'tokens', 'resources'])

const PROJECT_TABS: { id: ProjectTab; label: string }[] = [
  { id: 'thinking',  label: 'Thinking' },
  { id: 'tokens',    label: 'Tokens' },
  { id: 'resources', label: 'Resources' },
]

function formatCost(usd: number): string {
  if (usd < 0.005) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

interface ProjectPageProps {
  sessions: SessionInfo[]
}

export function ProjectPage({ sessions }: ProjectPageProps) {
  const { projectEncoded = '', tab = 'resources' } = useParams<{ projectEncoded: string; tab: string }>()
  const navigate = useNavigate()

  const activeTab = VALID_PROJECT_TABS.has(tab) ? (tab as ProjectTab) : 'resources'

  const projectSessions = sessions
    .filter(s => s.projectEncoded === projectEncoded)
    .sort((a, b) => b.lastModified - a.lastModified)

  const projectPath = projectSessions[0]?.projectPath ?? ''

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  // 프로젝트가 바뀌면 선택 세션을 전체 집계로 되돌린다.
  useEffect(() => { setSelectedSessionId(null) }, [projectEncoded])

  const sessionIds = projectSessions.map(s => s.sessionId)
  const { data: allEvents = [], isPending } = useQuery(sessionQueries.manyEvents(sessionIds))
  const loading = sessionIds.length > 0 && isPending

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
