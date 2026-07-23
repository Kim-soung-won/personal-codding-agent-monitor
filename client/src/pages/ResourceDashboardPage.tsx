import { useEffect, useMemo, useState } from 'react'
import { BarChart } from '@we/ai-template'
import type { BarChartView } from '@we/ai-template'
import { useTheme } from '../hooks/useTheme'
import { PageShell } from '../components/ui/PageShell'
import { FilterBar, type SelectOption } from '../components/ui/FilterBar'
import { StatCard } from '../components/ui/StatCard'
import { ChartCard } from '../components/ui/ChartCard'
import { RankTable, type Column } from '../components/ui/RankTable'
import { KIND_HEX, KIND_LABEL, kindStyle, type ResourceKind } from '../lib/resourceKind'
import { cn } from '../lib/utils'
import * as statsApi from '../lib/statsApi'
import type { ResourceCountRow } from '../types/stats'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function resourceLabel(r: ResourceCountRow): string {
  const server = r.kind === 'mcp' && r.mcp_server ? `${r.mcp_server}/` : ''
  const plugin = r.plugin ? `${r.plugin}:` : ''
  return `${plugin}${server}${r.resource}`
}

function KindBadge({ kind }: { kind: string }) {
  const s = kindStyle(kind)
  return <span className={cn('text-2xs font-semibold px-1.5 py-0.5 rounded', s.badge)}>{s.label}</span>
}

export function ResourceDashboardPage() {
  const { dark } = useTheme()
  const [from, setFrom] = useState(() => daysAgo(30))
  const [to, setTo] = useState(() => daysAgo(0))
  const [projectId, setProjectId] = useState<number | null>(null)
  const [userId, setUserId] = useState<number | null>(null)
  const [kind, setKind] = useState<ResourceKind | null>(null)

  const [projectOptions, setProjectOptions] = useState<SelectOption[]>([])
  const [userOptions, setUserOptions] = useState<number[]>([])
  const [rows, setRows] = useState<ResourceCountRow[]>([])
  const [loading, setLoading] = useState(false)

  // 필터 옵션 1회 로드
  useEffect(() => {
    statsApi.getProjects().then((ps) =>
      setProjectOptions(ps.map((p) => ({ value: p.id, label: p.name }))),
    )
    statsApi.getUsers().then((us) => setUserOptions(us.map((u) => u.id)))
  }, [])

  // 데이터 로드(필터 변경 시)
  useEffect(() => {
    setLoading(true)
    statsApi
      .getResourceCounts({ from, to, projectId, userId, kind })
      .then(setRows)
      .finally(() => setLoading(false))
  }, [from, to, projectId, userId, kind])

  const derived = useMemo(() => {
    const totalCalls = rows.reduce((s, r) => s + r.calls, 0)
    const mcp = rows.filter((r) => r.kind === 'mcp')
    const mcpCalls = mcp.reduce((s, r) => s + r.calls, 0)
    const mcpErr = mcp.reduce((s, r) => s + r.errors, 0)
    const mcpErrRate = mcpCalls > 0 ? (mcpErr / mcpCalls) * 100 : null
    const lowUse = rows.filter((r) => r.calls <= 2).length
    const topByCalls = [...rows].sort((a, b) => b.calls - a.calls)
    const lowByCalls = [...rows].sort((a, b) => a.calls - b.calls).slice(0, 20)
    return { totalCalls, mcpErrRate, mcpErr, lowUse, topByCalls, lowByCalls }
  }, [rows])

  const barData: BarChartView = {
    categories: derived.topByCalls.slice(0, 10).map(resourceLabel),
    series: [{ name: '호출', data: derived.topByCalls.slice(0, 10).map((r) => r.calls) }],
  }

  const columns: Column<ResourceCountRow>[] = [
    { key: 'resource', label: '리소스', render: (r) => <span className="font-mono text-xs">{resourceLabel(r)}</span> },
    { key: 'kind', label: '종류', render: (r) => <KindBadge kind={r.kind} /> },
    { key: 'calls', label: '호출', align: 'right', render: (r) => <span className="font-semibold">{r.calls}</span> },
    { key: 'sessions', label: '세션', align: 'right', render: (r) => r.sessions },
    {
      key: 'errors',
      label: '에러',
      align: 'right',
      render: (r) => (r.errors > 0 ? <span className="text-destructive font-semibold">{r.errors}</span> : <span className="text-muted-foreground/40">0</span>),
    },
  ]

  const isEmpty = !loading && rows.length === 0

  return (
    <PageShell
      title="Resource 평가"
      subtitle="skill · agent · mcp 호출 빈도와 신뢰도"
      toolbar={
        <FilterBar
          dateFrom={from}
          dateTo={to}
          onDateChange={(f, t) => { setFrom(f); setTo(t) }}
          projectOptions={projectOptions}
          projectId={projectId}
          onProjectChange={setProjectId}
          userOptions={userOptions}
          userId={userId}
          onUserChange={setUserId}
          kind={kind}
          onKindChange={setKind}
        />
      }
    >
      {/* 지표 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="총 호출" value={loading ? '…' : derived.totalCalls.toLocaleString()} sub={`${rows.length}종 리소스`} />
        <StatCard
          label="MCP 에러율"
          value={derived.mcpErrRate == null ? '—' : `${derived.mcpErrRate.toFixed(1)}%`}
          sub={derived.mcpErrRate == null ? 'MCP 호출 없음' : `${derived.mcpErr}건 에러`}
          tone={derived.mcpErrRate != null && derived.mcpErrRate > 5 ? 'bad' : 'default'}
        />
        <StatCard label="저사용 리소스" value={loading ? '…' : derived.lowUse} sub="≤2회 · 빈도 기준" tone={derived.lowUse > 0 ? 'warn' : 'default'} />
        <StatCard label="활성 리소스" value={loading ? '…' : rows.length} sub="호출된 종류 수" tone="good" />
      </div>

      {isEmpty ? (
        <p className="text-sm text-muted-foreground text-center py-16">
          이 기간·필터에 해당하는 리소스 호출이 없습니다.
        </p>
      ) : (
        <div className="space-y-4">
          <ChartCard title="Top 10 리소스 (호출)">
            <BarChart
              data={barData}
              height="280px"
              colors={[KIND_HEX.skill]}
              theme={dark ? 'dark' : 'light'}
              unit="회"
              customOption={{ xAxis: { axisLabel: { rotate: 30 } }, grid: { bottom: 80 } }}
            />
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium mb-3">고빈도 랭킹</p>
              <RankTable columns={columns} rows={derived.topByCalls.slice(0, 20)} keyOf={resourceLabel} barValueOf={(r) => r.calls} emptyMessage="데이터 없음" />
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium mb-1">저빈도 / 죽은 리소스</p>
              <p className="text-2xs text-muted-foreground mb-3">최근성 데이터 없음 · 호출 빈도 기준</p>
              <RankTable columns={columns} rows={derived.lowByCalls} keyOf={resourceLabel} emptyMessage="데이터 없음" />
            </div>
          </div>

          {/* 종류별 요약 칩 */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(KIND_LABEL) as ResourceKind[]).map((k) => {
              const c = rows.filter((r) => r.kind === k).reduce((s, r) => s + r.calls, 0)
              if (c === 0) return null
              const s = kindStyle(k)
              return (
                <span key={k} className={cn('text-xs px-2 py-1 rounded-md', s.badge)}>
                  {s.label} · {c}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </PageShell>
  )
}
