import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, DatelineChart, DoughnutChart } from '@we/ai-template'
import type { BarChartView, CategoryDoughnutChartView, DateLineChartView } from '@we/ai-template'
import { useTheme } from '@/shared/lib/useTheme'
import { extractInvocations, groupByPlugin } from '@shared/resource-extract'
import { sessionQueries } from '@/entities/session'
import { KIND_HEX as KIND_COLORS } from '@/shared/lib/resourceKind'
import { calcCostUsd, collectUsage } from '@shared/pricing'
import type { SessionInfo } from '@/entities/session'

function projectLabel(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function formatCost(usd: number): string {
  if (usd < 0.005) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

interface Props {
  sessions: SessionInfo[]
}

export function GlobalAnalytics({ sessions }: Props) {
  const { dark } = useTheme()
  const chartTheme = dark ? 'dark' : 'light'

  const sessionIds = sessions.map(s => s.sessionId)
  const { data: allEvents = [], isPending } = useQuery(sessionQueries.manyEvents(sessionIds))
  const loading = sessionIds.length > 0 && isPending

  const derived = useMemo(() => {
    const invocations = extractInvocations(allEvents)

    // Kind counts
    const skillCount    = invocations.filter(i => i.kind === 'skill').length
    const agentCount    = invocations.filter(i => i.kind === 'agent').length
    const workflowCount = invocations.filter(i => i.kind === 'workflow').length
    const artifactCount = invocations.filter(i => i.kind === 'artifact').length
    const mcpCount      = invocations.filter(i => i.kind === 'mcp').length
    const totalCalls    = skillCount + agentCount + workflowCount + artifactCount + mcpCount

    // Top resources (key = plugin:resource if plugin exists, else resource)
    const freqMap = new Map<string, { count: number; kind: string }>()
    for (const inv of invocations) {
      const key = inv.plugin != null && inv.plugin.length > 0
        ? `${inv.plugin}:${inv.resource}`
        : inv.resource
      const existing = freqMap.get(key)
      if (existing) {
        existing.count++
      } else {
        freqMap.set(key, { count: 1, kind: inv.kind })
      }
    }
    const sorted = [...freqMap.entries()].sort((a, b) => b[1].count - a[1].count)
    const top10 = sorted.slice(0, 10)

    // Cost estimation — 요청 단위 중복 제거 후 모델별 단가 적용
    const usageEntries = collectUsage(allEvents)
    const costUsd = usageEntries.reduce((sum, u) => sum + calcCostUsd(u.usage, u.model), 0)

    const observedModels = [
      ...new Set(usageEntries.map(u => u.model).filter((m): m is string => Boolean(m))),
    ].sort()

    // Calls by day (YYYY-MM-DD)
    const skillByDay    = new Map<string, number>()
    const agentByDay    = new Map<string, number>()
    const workflowByDay = new Map<string, number>()
    const artifactByDay = new Map<string, number>()
    const mcpByDay      = new Map<string, number>()

    for (const inv of invocations) {
      const day = inv.timestamp.slice(0, 10)
      const map = inv.kind === 'skill' ? skillByDay
        : inv.kind === 'agent' ? agentByDay
        : inv.kind === 'workflow' ? workflowByDay
        : inv.kind === 'artifact' ? artifactByDay
        : mcpByDay
      map.set(day, (map.get(day) ?? 0) + 1)
    }
    const allDays = [
      ...new Set([
        ...skillByDay.keys(), ...agentByDay.keys(), ...workflowByDay.keys(),
        ...artifactByDay.keys(), ...mcpByDay.keys(),
      ]),
    ].sort()

    // Calls by project (using sessionId → session → projectEncoded)
    const sessionProjectMap = new Map<string, string>()
    for (const s of sessions) {
      sessionProjectMap.set(s.sessionId, s.projectPath)
    }

    const projectCountMap = new Map<string, { skill: number; agent: number; workflow: number; artifact: number; mcp: number }>()
    for (const inv of invocations) {
      const projPath = sessionProjectMap.get(inv.sessionId) ?? 'Unknown'
      const label    = projectLabel(projPath)
      const existing = projectCountMap.get(label)
      if (existing) {
        existing[inv.kind]++
      } else {
        projectCountMap.set(label, { skill: 0, agent: 0, workflow: 0, artifact: 0, mcp: 0, [inv.kind]: 1 })
      }
    }
    // Top 8 projects by total
    const projectEntries = [...projectCountMap.entries()]
      .map(([name, c]) => ({ name, total: c.skill + c.agent + c.workflow + c.artifact + c.mcp, ...c }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    // Plugin-level aggregation (standalone excluded from top list)
    const pluginGroups = groupByPlugin(invocations)
    const topPluginGroups = pluginGroups
      .filter(g => g.plugin !== '(standalone)')
      .slice(0, 8)

    return {
      skillCount, agentCount, workflowCount, artifactCount, mcpCount, totalCalls, costUsd,
      observedModels,
      top10, allDays, skillByDay, agentByDay, workflowByDay, artifactByDay, mcpByDay,
      projectEntries, topResource: sorted[0]?.[0] ?? '—',
      topPluginGroups,
    }
  }, [allEvents, sessions])

  // ── Chart data shapes ──────────────────────────────────────────────────────

  const doughnutData: CategoryDoughnutChartView = [
    { name: 'Skill',    value: derived.skillCount },
    { name: 'Agent',    value: derived.agentCount },
    { name: 'Workflow', value: derived.workflowCount },
    { name: 'Artifact', value: derived.artifactCount },
    { name: 'MCP',      value: derived.mcpCount },
  ].filter(d => d.value > 0)

  const topBarData: BarChartView = {
    categories: derived.top10.map(([name]) => name),
    series: [
      { name: '호출 횟수', data: derived.top10.map(([, { count }]) => count) },
    ],
  }

  const datelineData: DateLineChartView = {
    timestamps: derived.allDays,
    series: [
      { name: 'Skill',    dataPoints: derived.allDays.map(d => ({ timestamp: d, requests: derived.skillByDay.get(d) ?? 0 })) },
      { name: 'Agent',    dataPoints: derived.allDays.map(d => ({ timestamp: d, requests: derived.agentByDay.get(d) ?? 0 })) },
      { name: 'Workflow', dataPoints: derived.allDays.map(d => ({ timestamp: d, requests: derived.workflowByDay.get(d) ?? 0 })) },
      { name: 'Artifact', dataPoints: derived.allDays.map(d => ({ timestamp: d, requests: derived.artifactByDay.get(d) ?? 0 })) },
      { name: 'MCP',      dataPoints: derived.allDays.map(d => ({ timestamp: d, requests: derived.mcpByDay.get(d) ?? 0 })) },
    ].filter(s => s.dataPoints.some(p => p.requests > 0)),
  }

  const PLUGIN_SERIES_DEFS = [
    { name: 'Skill',    kind: 'skill'    as const, color: KIND_COLORS.skill },
    { name: 'Agent',    kind: 'agent'    as const, color: KIND_COLORS.agent },
    { name: 'Workflow', kind: 'workflow' as const, color: KIND_COLORS.workflow },
    { name: 'Artifact', kind: 'artifact' as const, color: KIND_COLORS.artifact },
    { name: 'MCP',      kind: 'mcp'      as const, color: KIND_COLORS.mcp },
  ]

  const rawPluginSeries = PLUGIN_SERIES_DEFS.map(def => ({
    name: def.name,
    color: def.color,
    data: derived.topPluginGroups.map(g => g.kindCounts[def.kind]),
  }))
  const activePluginSeries = rawPluginSeries.filter(s => s.data.some(v => v > 0))
  const pluginBarData: BarChartView = {
    categories: derived.topPluginGroups.map(g => g.plugin),
    series: activePluginSeries.map(s => ({ name: s.name, data: s.data })),
  }
  const pluginBarColors = activePluginSeries.map(s => s.color)

  const projectBarData: BarChartView = {
    categories: derived.projectEntries.map(p => p.name),
    series: [
      { name: 'Skill',    data: derived.projectEntries.map(p => p.skill) },
      { name: 'Agent',    data: derived.projectEntries.map(p => p.agent) },
      { name: 'Workflow', data: derived.projectEntries.map(p => p.workflow) },
      { name: 'Artifact', data: derived.projectEntries.map(p => p.artifact) },
      { name: 'MCP',      data: derived.projectEntries.map(p => p.mcp) },
    ].filter(s => s.data.some(v => v > 0)),
  }

  const isEmpty = derived.totalCalls === 0 && !loading

  return (
    <div className="space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="전체 세션"
          value={sessions.length.toString()}
          sub={`${allEvents.length.toLocaleString()}개 이벤트`}
        />
        <StatCard
          label="총 Resource 호출"
          value={derived.totalCalls.toString()}
          sub={[
            `Skill ${derived.skillCount}`,
            `Agent ${derived.agentCount}`,
            derived.workflowCount > 0 ? `Workflow ${derived.workflowCount}` : null,
            derived.artifactCount > 0 ? `Artifact ${derived.artifactCount}` : null,
            derived.mcpCount > 0 ? `MCP ${derived.mcpCount}` : null,
          ].filter(Boolean).join(' · ')}
        />
        <StatCard
          label="최다 호출 Resource"
          value={derived.topResource}
          sub={derived.top10[0] ? `${derived.top10[0][1].count}회` : undefined}
        />
        <StatCard
          label="추산 비용"
          value={derived.costUsd > 0 ? formatCost(derived.costUsd) : '—'}
          sub={
            derived.observedModels.length > 0
              ? `${derived.observedModels.length}개 모델 단가 적용`
              : undefined
          }
        />
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground animate-pulse text-center py-4">
          {sessions.length}개 세션 데이터 로딩 중…
        </p>
      )}

      {isEmpty && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Resource 호출 데이터 없음
        </p>
      )}

      {!isEmpty && (
        <>
          {/* Row 1: Doughnut + Top Resources bar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium mb-3">종류별 분포</p>
              <DoughnutChart
                data={doughnutData}
                height="260px"
                colors={[KIND_COLORS.skill, KIND_COLORS.agent, KIND_COLORS.workflow, KIND_COLORS.artifact, KIND_COLORS.mcp]}
                theme={chartTheme}
                legendPreset="bottom"
              />
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium mb-3">Top 10 Resources</p>
              <BarChart
                data={topBarData}
                height="260px"
                colors={['#6366f1']}
                theme={chartTheme}
                unit="회"
                customOption={{
                  xAxis: { axisLabel: { rotate: 30 } },
                  grid: { bottom: 60 },
                }}
              />
            </div>
          </div>

          {/* Row 2: Calls over time */}
          {derived.allDays.length > 1 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium mb-3">일별 호출 추이</p>
              <DatelineChart
                data={datelineData}
                height="260px"
                colors={[KIND_COLORS.skill, KIND_COLORS.agent, KIND_COLORS.workflow, KIND_COLORS.artifact, KIND_COLORS.mcp]}
                theme={chartTheme}
                unit="회"
                labelRotate={derived.allDays.length > 10 ? 45 : 0}
              />
            </div>
          )}

          {/* Row 3: Per-project breakdown */}
          {derived.projectEntries.length > 1 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium mb-3">프로젝트별 호출 현황</p>
              <BarChart
                data={projectBarData}
                height="260px"
                colors={[KIND_COLORS.skill, KIND_COLORS.agent, KIND_COLORS.workflow, KIND_COLORS.artifact, KIND_COLORS.mcp]}
                theme={chartTheme}
                unit="회"
              />
            </div>
          )}

          {/* Row 4: Per-plugin breakdown */}
          {derived.topPluginGroups.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium mb-3">플러그인별 호출 현황</p>
              <BarChart
                data={pluginBarData}
                height="260px"
                colors={pluginBarColors}
                theme={chartTheme}
                unit="회"
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
