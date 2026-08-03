import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, DateLineChart, DoughnutChart } from '@/shared/ui/charts'
import type { BarChartView, CategoryDoughnutChartView, DateLineChartView } from '@/shared/ui/charts'
import { useTheme } from '@/shared/lib/useTheme'
import { cn } from '@/shared/lib/utils'
import { TOKEN_SERIES, compactTokens } from '@/shared/lib/tokenSeries'
import {
  INVOCATION_KIND_ORDER,
  INVOCATION_KIND_STYLE,
  kindKey,
  type InvocationKindKey,
} from '@/shared/lib/invocationKind'
import { ChartCard } from '@/shared/ui/ChartCard'
import { commitRecordQueries } from '@/entities/commit-record'

/**
 * 조회 기간 프리셋. 0 은 제한 없음(전체).
 * 커밋 기록의 시각축은 커밋의 capturedAt 이다 — 호출 한 건에는 자체 시각이 없다.
 */
const RANGE_OPTIONS = [
  { days: 7, label: '최근 7일' },
  { days: 30, label: '최근 30일' },
  { days: 0, label: '전체' },
]

/** YYYY-MM-DD(로컬). 서버의 from/to 는 날짜 단위로 받는다. */
function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function rangeParams(days: number): { from?: string; to?: string } {
  if (days <= 0) return {}
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - (days - 1))
  return { from: toDateInput(from), to: toDateInput(to) }
}

function formatCost(usd: number): string {
  if (usd <= 0) return '—'
  if (usd < 0.005) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

function resourceLabel(row: { plugin: string | null; resource: string }): string {
  return row.plugin ? `${row.plugin}:${row.resource}` : row.resource
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

/** 차트 헤더 우측의 보조 수치·단서. ChartCard 의 actions 슬롯에 넣는다. */
function ChartNote({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-muted-foreground tabular-nums">{children}</span>
}

/**
 * 커밋 기록(DB) 기반 분석 대시보드.
 *
 * 데이터는 `/stats/overview` 한 번의 응답에서 전부 나온다 — 축마다 따로 부르면
 * 필터가 바뀌는 순간 화면 안에서 구간이 어긋난다.
 */
export function GlobalAnalytics() {
  const { dark } = useTheme()
  const chartTheme = dark ? 'dark' : 'light'
  const [rangeDays, setRangeDays] = useState(7)

  const filter = useMemo(() => rangeParams(rangeDays), [rangeDays])
  const { data, isPending } = useQuery(commitRecordQueries.overview(filter))

  const kindColor = (key: InvocationKindKey) =>
    dark ? INVOCATION_KIND_STYLE[key].dark : INVOCATION_KIND_STYLE[key].light

  const derived = useMemo(() => {
    const summary = data?.summary
    const kinds = data?.kinds ?? []
    const topResources = data?.topResources ?? []
    const dailyTokens = data?.dailyTokens ?? []
    const dailyKinds = data?.dailyKinds ?? []
    const projectKinds = data?.projectKinds ?? []

    // 종류 축은 항상 고정 순서로 본다 — 건수 순으로 정렬하면 필터를 바꿀 때마다
    // 색이 자리를 바꿔 같은 종류가 다른 색으로 보인다.
    const kindCount = new Map<InvocationKindKey, number>()
    for (const row of kinds) kindCount.set(kindKey(row.kind), row.count)

    const days = [...new Set(dailyKinds.map((r) => String(r.day).slice(0, 10)))].sort()
    const kindByDay = new Map<string, number>()
    for (const row of dailyKinds) {
      kindByDay.set(`${String(row.day).slice(0, 10)}|${kindKey(row.kind)}`, row.count)
    }

    const tokenDays = dailyTokens.map((r) => String(r.day).slice(0, 10))

    // 프로젝트별 — 총 호출 상위 8개만. 나머지는 막대가 뭉개져 읽히지 않는다.
    const projectTotals = new Map<string, number>()
    const projectByKind = new Map<string, number>()
    for (const row of projectKinds) {
      projectTotals.set(row.project, (projectTotals.get(row.project) ?? 0) + row.count)
      projectByKind.set(`${row.project}|${kindKey(row.kind)}`, row.count)
    }
    const topProjects = [...projectTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name)

    const totalTokens = summary
      ? summary.inputTokens + summary.outputTokens + summary.cacheReadTokens + summary.cacheCreationTokens
      : 0

    return {
      summary,
      topResources,
      dailyTokens,
      kindCount,
      days,
      kindByDay,
      tokenDays,
      topProjects,
      projectByKind,
      totalTokens,
      totalInvocations: summary?.invocations ?? 0,
    }
  }, [data])

  // ── 차트 데이터 ────────────────────────────────────────────────────────────

  // 0건인 종류는 빼되 색은 종류에 붙여 뽑는다 — 걸러진 뒤 색을 순서대로 매기면 밀린다.
  const kindSlices = INVOCATION_KIND_ORDER.map((key) => ({
    key,
    name: INVOCATION_KIND_STYLE[key].label,
    value: derived.kindCount.get(key) ?? 0,
  })).filter((s) => s.value > 0)

  const doughnutData: CategoryDoughnutChartView = kindSlices.map(({ name, value }) => ({ name, value }))
  const doughnutColors = kindSlices.map((s) => kindColor(s.key))

  const topBarData: BarChartView = {
    categories: derived.topResources.map(resourceLabel),
    series: [{ name: '호출 횟수', data: derived.topResources.map((r) => r.count) }],
  }

  const activeDayKinds = INVOCATION_KIND_ORDER.map((key) => ({
    key,
    name: INVOCATION_KIND_STYLE[key].label,
    dataPoints: derived.days.map((d) => ({
      timestamp: d,
      requests: derived.kindByDay.get(`${d}|${key}`) ?? 0,
    })),
  })).filter((s) => s.dataPoints.some((p) => p.requests > 0))

  const callLineData: DateLineChartView = {
    timestamps: derived.days,
    series: activeDayKinds.map(({ name, dataPoints }) => ({ name, dataPoints })),
  }
  const callLineColors = activeDayKinds.map((s) => kindColor(s.key))

  const tokenLineData: DateLineChartView = {
    timestamps: derived.tokenDays,
    series: TOKEN_SERIES.map((s) => ({
      name: s.label,
      dataPoints: derived.dailyTokens.map((r) => ({
        timestamp: String(r.day).slice(0, 10),
        requests: r[s.key],
      })),
    })),
  }
  const tokenLineColors = TOKEN_SERIES.map((s) => (dark ? s.dark : s.light))

  const activeProjectKinds = INVOCATION_KIND_ORDER.map((key) => ({
    key,
    name: INVOCATION_KIND_STYLE[key].label,
    data: derived.topProjects.map((p) => derived.projectByKind.get(`${p}|${key}`) ?? 0),
  })).filter((s) => s.data.some((v) => v > 0))

  const projectBarData: BarChartView = {
    categories: derived.topProjects,
    series: activeProjectKinds.map(({ name, data }) => ({ name, data })),
  }
  const projectBarColors = activeProjectKinds.map((s) => kindColor(s.key))

  const summary = derived.summary
  const isEmpty = !isPending && (summary?.commits ?? 0) === 0

  return (
    <div className="space-y-6">
      {/* 조회 기간 — 아래 카드·차트 전부가 이 구간을 본다 */}
      <div className="flex items-center gap-1.5">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            onClick={() => setRangeDays(opt.days)}
            className={cn(
              'text-xs px-2.5 py-1 rounded-md border transition-colors',
              rangeDays === opt.days
                ? 'border-primary text-primary bg-primary/10'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="커밋 기록"
          value={(summary?.commits ?? 0).toLocaleString()}
          sub={`${(summary?.sessions ?? 0).toLocaleString()}개 세션`}
        />
        <StatCard
          label="총 호출"
          value={derived.totalInvocations.toLocaleString()}
          sub={INVOCATION_KIND_ORDER.filter((k) => (derived.kindCount.get(k) ?? 0) > 0)
            .map((k) => `${INVOCATION_KIND_STYLE[k].label} ${derived.kindCount.get(k)}`)
            .join(' · ')}
        />
        <StatCard
          label="토큰 합계"
          value={compactTokens(derived.totalTokens)}
          sub={`캐시 읽기 ${compactTokens(summary?.cacheReadTokens ?? 0)} 포함`}
        />
        <StatCard
          label="추산 비용"
          value={formatCost(summary?.estimatedCostUsd ?? 0)}
          sub={
            (summary?.estimatedCostUsd ?? 0) > 0
              ? '커밋 기록에 적재된 값 합계'
              : '기록에 단가 산출값이 없음'
          }
        />
      </div>

      {isPending && (
        <p className="text-sm text-muted-foreground animate-pulse text-center py-4">집계 불러오는 중…</p>
      )}

      {isEmpty && (
        <p className="text-sm text-muted-foreground text-center py-8">
          이 기간에 적재된 커밋 기록이 없습니다
        </p>
      )}

      {!isEmpty && !isPending && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartCard title="종류별 분포">
              <DoughnutChart
                data={doughnutData}
                height="260px"
                colors={doughnutColors}
                theme={chartTheme}
              />
            </ChartCard>

            <ChartCard title="Top 10 리소스">
              <BarChart
                data={topBarData}
                height="260px"
                colors={['#2a78d6']}
                theme={chartTheme}
                unit="회"
                labelRotate={30}
              />
            </ChartCard>
          </div>

          <ChartCard
            title="토큰 사용량 추이"
            actions={
              <ChartNote>
                {`합계 ${compactTokens(derived.totalTokens)} · ${TOKEN_SERIES.map(
                  (s) => `${s.label} ${compactTokens(tokenTotal(derived.dailyTokens, s.key))}`,
                ).join(' · ')}`}
              </ChartNote>
            }
          >
            <DateLineChart
              data={tokenLineData}
              height="260px"
              colors={tokenLineColors}
              theme={chartTheme}
              valueFormat={compactTokens}
              labelRotate={derived.tokenDays.length > 10 ? 45 : 0}
            />
          </ChartCard>

          {derived.days.length > 1 && (
            <ChartCard title="일별 호출 추이" actions={<ChartNote>커밋 시각(capturedAt) 기준</ChartNote>}>
              <DateLineChart
                data={callLineData}
                height="260px"
                colors={callLineColors}
                theme={chartTheme}
                unit="회"
                labelRotate={derived.days.length > 10 ? 45 : 0}
              />
            </ChartCard>
          )}

          {derived.topProjects.length > 1 && (
            <ChartCard title="프로젝트별 호출 현황" actions={<ChartNote>상위 8개 프로젝트</ChartNote>}>
              <BarChart
                data={projectBarData}
                height="260px"
                colors={projectBarColors}
                theme={chartTheme}
                unit="회"
              />
            </ChartCard>
          )}
        </>
      )}
    </div>
  )
}

/** 토큰 종류별 기간 합계. 카드 부제와 차트가 같은 수를 보게 한 곳에서 더한다. */
function tokenTotal(
  rows: Array<{ inputTokens: number; outputTokens: number; cacheRead: number; cacheCreation: number }>,
  key: (typeof TOKEN_SERIES)[number]['key'],
): number {
  return rows.reduce((sum, r) => sum + r[key], 0)
}
