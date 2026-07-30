import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageShell } from '@/components/ui/PageShell'
import { StatCard } from '@/components/ui/StatCard'
import { cn } from '@/lib/utils'
import * as api from '@/lib/agentFactoryApi'
import type {
  AgentStatRow,
  CommitRecordSummary,
  ProjectRef,
  SignalStatRow,
  UserRef,
} from '@/types/agentFactory'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function compactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

const SELECT_CLASS =
  'h-7 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary'

/** 신호 뱃지 — 확정된 것만 강조하고 오탐은 흐리게 둔다. */
function SignalBadges({ record }: { record: CommitRecordSummary }) {
  const confirmed = record.signals.filter((s) => s.verdict === 'CONFIRMED')
  if (confirmed.length === 0) {
    return <span className="text-2xs text-muted-foreground/50">신호 없음</span>
  }
  return (
    <span className="flex gap-1">
      {confirmed.map((s, i) => (
        <span
          key={i}
          className={cn(
            'text-2xs px-1.5 py-0.5 rounded font-medium',
            s.polarity === 'NEGATIVE'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-success/10 text-success',
          )}
        >
          {s.polarity === 'NEGATIVE' ? '🔴' : '🟢'} {s.confirmedCount ?? ''}
        </span>
      ))}
    </span>
  )
}

export function CommitRecordsPage() {
  // 기본 조회 범위는 일주일. to 는 서버에서 그날 끝(23:59:59.999)까지 포함하도록 확장된다.
  const [from, setFrom] = useState(() => daysAgo(6))
  const [to, setTo] = useState(() => daysAgo(0))
  const [projectId, setProjectId] = useState<number | null>(null)
  const [userId, setUserId] = useState<number | null>(null)
  const [agent, setAgent] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const [projects, setProjects] = useState<ProjectRef[]>([])
  const [users, setUsers] = useState<UserRef[]>([])
  const [agentStats, setAgentStats] = useState<AgentStatRow[]>([])
  const [signalStats, setSignalStats] = useState<SignalStatRow[]>([])
  const [items, setItems] = useState<CommitRecordSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.getMeta().then((m) => {
      setProjects(m.projects)
      setUsers(m.users)
    })
    api.getAgentStats().then(setAgentStats)
    api.getSignalStats().then(setSignalStats)
  }, [])

  // 필터가 바뀌면 첫 페이지로 되돌린다(빈 페이지에 갇히는 것 방지).
  useEffect(() => {
    setPage(1)
  }, [from, to, projectId, userId, agent])

  useEffect(() => {
    setLoading(true)
    api
      .getRecords({ from, to, projectId, userId, agent, page, pageSize: 20 })
      .then((r) => {
        setItems(r.items)
        setTotal(r.total)
      })
      .finally(() => setLoading(false))
  }, [from, to, projectId, userId, agent, page])

  const derived = useMemo(() => {
    const outputTokens = items.reduce((s, r) => s + r.outputTokens, 0)
    const cacheCreation = items.reduce((s, r) => s + r.cacheCreationTokens, 0)
    const negConfirmed =
      signalStats.find((s) => s.polarity === 'NEGATIVE' && s.verdict === 'CONFIRMED')?.count ?? 0
    const negFalse =
      signalStats.find((s) => s.polarity === 'NEGATIVE' && s.verdict === 'FALSE_POSITIVE')?.count ??
      0
    const posConfirmed =
      signalStats.find((s) => s.polarity === 'POSITIVE' && s.verdict === 'CONFIRMED')?.count ?? 0
    // 감지기 정밀도 — 사전 플래그 중 실제로 살아남은 비율
    const flagged = negConfirmed + negFalse
    const precision = flagged > 0 ? (negConfirmed / flagged) * 100 : null
    return { outputTokens, cacheCreation, negConfirmed, posConfirmed, precision }
  }, [items, signalStats])

  const totalPages = Math.max(Math.ceil(total / 20), 1)

  return (
    <PageShell
      title="커밋 기록"
      subtitle="커밋 단위로 축적한 에이전트 사용 과정과 피드백"
      toolbar={
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-4 py-2 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={SELECT_CLASS}
            />
            <span className="text-xs text-muted-foreground">~</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={SELECT_CLASS}
            />
          </div>
          <select
            className={SELECT_CLASS}
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">전체 프로젝트</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className={SELECT_CLASS}
            value={userId ?? ''}
            onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">전체 작성자</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName ?? u.identifier}
              </option>
            ))}
          </select>
          <select
            className={SELECT_CLASS}
            value={agent ?? ''}
            onChange={(e) => setAgent(e.target.value || null)}
          >
            <option value="">전체 에이전트</option>
            {agentStats.map((a) => (
              <option key={`${a.plugin}:${a.agent}`} value={a.agent}>
                {a.agent} ({a.commits})
              </option>
            ))}
          </select>
        </div>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="커밋 기록"
          value={loading ? '…' : total.toLocaleString()}
          sub={`${projects.length}개 프로젝트`}
        />
        <StatCard
          label="확정 부정 신호"
          value={derived.negConfirmed}
          sub="에이전트가 오류를 인정한 지점"
          tone={derived.negConfirmed > 0 ? 'bad' : 'good'}
        />
        <StatCard
          label="확정 긍정 신호"
          value={derived.posConfirmed}
          sub="강화할 패턴"
          tone="good"
        />
        <StatCard
          label="신호 감지 정밀도"
          value={derived.precision == null ? '—' : `${derived.precision.toFixed(0)}%`}
          sub={derived.precision == null ? '부정 플래그 없음' : '사전 플래그 중 실제 비율'}
          tone={derived.precision != null && derived.precision < 50 ? 'warn' : 'default'}
        />
      </div>

      {!loading && items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">
          이 기간·필터에 해당하는 커밋 기록이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <Link
              key={r.id}
              to={`/records/${r.id}`}
              className="block rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.commitSubject ?? '(제목 없음)'}
                  </p>
                  <p className="text-2xs text-muted-foreground font-mono mt-0.5">
                    {r.commitSha.slice(0, 7)}
                    {r.revision > 1 && ` · r${r.revision}`} · {r.project.name}
                    {r.user && ` · ${r.user.displayName ?? r.user.identifier}`} ·{' '}
                    {r.capturedAt.slice(0, 10)}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <SignalBadges record={r} />
                  {r.status === 'CAPTURED' && (
                    <span className="text-2xs px-1.5 py-0.5 rounded bg-warning/10 text-warning">
                      요약 대기
                    </span>
                  )}
                </div>
              </div>

              {r.summary && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{r.summary}</p>
              )}

              <div className="flex items-center gap-3 flex-wrap text-2xs text-muted-foreground">
                <span>이벤트 {r.eventCount.toLocaleString()}</span>
                <span>호출 {r._count.invocations}</span>
                <span>out {compactTokens(r.outputTokens)}</span>
                <span>cache-w {compactTokens(r.cacheCreationTokens)}</span>
                {r.agents.map((a) => (
                  <span
                    key={`${a.plugin}:${a.agent}`}
                    className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium"
                  >
                    {a.agent}
                  </span>
                ))}
              </div>
            </Link>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-3">
              <button
                className={cn(SELECT_CLASS, 'disabled:opacity-40')}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                이전
              </button>
              <span className="text-xs text-muted-foreground">
                {page} / {totalPages}
              </span>
              <button
                className={cn(SELECT_CLASS, 'disabled:opacity-40')}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                다음
              </button>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
