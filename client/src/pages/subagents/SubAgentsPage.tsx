import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageShell } from '@/shared/ui/PageShell'
import { StatCard } from '@/shared/ui/StatCard'
import { RankTable, type Column } from '@/shared/ui/RankTable'
import { compactTokens } from '@/shared/lib/format'
import { commitRecordQueries } from '@/entities/commit-record'
import type { AgentStatRow } from '@/entities/commit-record'

export function SubAgentsPage() {
  const navigate = useNavigate()
  const { data: rows = [], isPending: loading } = useQuery(commitRecordQueries.agentStats())

  const derived = useMemo(() => {
    const spawns = rows.reduce((s, r) => s + r.spawns, 0)
    const output = rows.reduce((s, r) => s + r.outputTokens, 0)
    const errors = rows.reduce((s, r) => s + r.errors, 0)
    // 계량치가 하나도 없으면(전부 0) metrics 사이드카가 아직 안 붙은 상태다.
    const hasMetrics = rows.some(
      (r) => r.outputTokens > 0 || r.inputTokens > 0 || r.toolCalls > 0,
    )
    return { spawns, output, errors, hasMetrics }
  }, [rows])

  const columns: Column<AgentStatRow>[] = [
    {
      key: 'agent',
      label: '에이전트',
      render: (r) => (
        <div className="min-w-0">
          <span className="font-medium">{r.agent}</span>
          {r.plugin && <span className="text-2xs text-muted-foreground ml-1.5">{r.plugin}</span>}
        </div>
      ),
    },
    { key: 'commits', label: '커밋', align: 'right', render: (r) => r.commits },
    { key: 'spawns', label: 'spawn', align: 'right', render: (r) => r.spawns },
    {
      key: 'outputTokens',
      label: 'output',
      align: 'right',
      render: (r) => <span className="tabular-nums">{compactTokens(r.outputTokens)}</span>,
    },
    {
      key: 'cacheReadTokens',
      label: 'cache read',
      align: 'right',
      render: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {compactTokens(r.cacheReadTokens)}
        </span>
      ),
    },
    { key: 'toolCalls', label: '도구호출', align: 'right', render: (r) => r.toolCalls },
    {
      key: 'errors',
      label: '에러',
      align: 'right',
      render: (r) =>
        r.errors > 0 ? (
          <span className="text-destructive font-semibold">{r.errors}</span>
        ) : (
          <span className="text-muted-foreground/40">0</span>
        ),
    },
  ]

  return (
    <PageShell title="Sub-agents" subtitle="서브에이전트별 spawn·토큰·호출·에러 (커밋 누적)">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="에이전트" value={loading ? '…' : rows.length} sub="관측된 종류" />
        <StatCard label="총 spawn" value={loading ? '…' : derived.spawns} sub="누적 호출" />
        <StatCard
          label="총 output"
          value={loading ? '…' : compactTokens(derived.output)}
          sub="생성 토큰"
        />
        <StatCard
          label="총 에러"
          value={loading ? '…' : derived.errors}
          sub="실행 중 tool_result 에러"
          tone={derived.errors > 0 ? 'bad' : 'good'}
        />
      </div>

      {!loading && !derived.hasMetrics && rows.length > 0 && (
        <p className="text-2xs text-muted-foreground mb-3">
          계량치(토큰·호출)는 metrics 사이드카가 붙은 기록부터 채워집니다. 이전 기록은 spawn·커밋
          수만 표시됩니다.
        </p>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <RankTable
          columns={columns}
          rows={rows}
          keyOf={(r) => `${r.plugin ?? ''}:${r.agent}`}
          barValueOf={(r) => r.outputTokens}
          onRowClick={(r) => navigate(`/subagents/${encodeURIComponent(r.agent)}`)}
          emptyMessage={loading ? '불러오는 중…' : '서브에이전트 사용 기록이 없습니다.'}
        />
      </div>
    </PageShell>
  )
}
