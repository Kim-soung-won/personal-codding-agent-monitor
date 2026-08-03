import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, DateLineChart, DoughnutChart } from '@/shared/ui/charts'
import type { BarChartView, CategoryDoughnutChartView, DateLineChartView } from '@/shared/ui/charts'
import { useTheme } from '@/shared/lib/useTheme'
import { cn } from '@/shared/lib/utils'
import { TOKEN_SERIES, compactTokens } from '@/shared/lib/tokenSeries'
import { enumerateDays, toDayKey } from '@/shared/lib/dateRange'
import {
  INVOCATION_KIND_ORDER,
  INVOCATION_KIND_STYLE,
  UNCLASSIFIED,
  kindKey,
  type InvocationKindKey,
} from '@/shared/lib/invocationKind'
import { ChartCard } from '@/shared/ui/ChartCard'
import { commitRecordQueries, type DailyTokenRow } from '@/entities/commit-record'

/**
 * 조회 기간 프리셋. 0 은 제한 없음(전체).
 * 커밋 기록의 시각축은 커밋의 capturedAt 이다 — 호출 한 건에는 자체 시각이 없다.
 */
const RANGE_OPTIONS = [
  { days: 7, label: '최근 7일' },
  { days: 30, label: '최근 30일' },
  { days: 0, label: '전체' },
]

/**
 * 종류 범위 프리셋.
 *
 * 내장 도구(Bash·Edit·Read…)와 미분류가 호출 수의 대부분이라 그대로 집계하면
 * Top 리소스도 추이도 그 둘로 덮인다. 기본은 위임 축(에이전트·스킬·MCP)만 본다.
 */
const SCOPE_OPTIONS = [
  { key: 'managed' as const, label: '에이전트·스킬·MCP', kinds: ['AGENT', 'SKILL', 'MCP'] as const },
  { key: 'all' as const, label: '내장 도구·미분류 포함', kinds: [] as const },
]

/** 종류별 순위표 패널. 순서는 위임 축을 먼저 본다는 뜻이다. */
const RANK_PANELS = [
  { kind: 'AGENT' as const, title: '에이전트별 호출' },
  { kind: 'SKILL' as const, title: 'Skill 별 호출' },
  { kind: 'MCP' as const, title: 'MCP 별 호출' },
  { kind: 'TOOL' as const, title: '내장 도구별 호출' },
  { kind: UNCLASSIFIED, title: '미분류 호출' },
]

/** 서버의 from/to 는 날짜 단위(YYYY-MM-DD)로 받는다. */
function rangeParams(days: number): { from?: string; to?: string } {
  if (days <= 0) return {}
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - (days - 1))
  return { from: toDayKey(from), to: toDayKey(to) }
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
  const [scope, setScope] = useState<'managed' | 'all'>('managed')

  const filter = useMemo(() => {
    const kinds = SCOPE_OPTIONS.find((o) => o.key === scope)?.kinds ?? []
    return { ...rangeParams(rangeDays), kinds: [...kinds] }
  }, [rangeDays, scope])
  const { data, isPending } = useQuery(commitRecordQueries.overview(filter))

  const kindColor = (key: InvocationKindKey) =>
    dark ? INVOCATION_KIND_STYLE[key].dark : INVOCATION_KIND_STYLE[key].light

  const derived = useMemo(() => {
    const summary = data?.summary
    const kinds = data?.kinds ?? []
    const resources = data?.resources ?? []
    const dailyTokens = data?.dailyTokens ?? []
    const dailyKinds = data?.dailyKinds ?? []
    const projectKinds = data?.projectKinds ?? []

    // 종류 축은 항상 고정 순서로 본다 — 건수 순으로 정렬하면 필터를 바꿀 때마다
    // 색이 자리를 바꿔 같은 종류가 다른 색으로 보인다.
    const kindCount = new Map<InvocationKindKey, number>()
    for (const row of kinds) kindCount.set(kindKey(row.kind), row.count)

    const kindByDay = new Map<string, number>()
    for (const row of dailyKinds) {
      kindByDay.set(`${String(row.day).slice(0, 10)}|${kindKey(row.kind)}`, row.count)
    }
    const tokenByDay = new Map<string, DailyTokenRow>()
    for (const row of dailyTokens) tokenByDay.set(String(row.day).slice(0, 10), row)

    // 날짜 축은 기록이 있는 날이 아니라 조회 구간 전체다. 기간 프리셋이 있으면 그 구간을,
    // '전체'면 데이터가 걸친 최초~최종일을 쓰고 그 사이 빈 날은 0으로 그린다.
    const seenDays = [
      ...new Set([...tokenByDay.keys(), ...[...kindByDay.keys()].map((k) => k.split('|')[0])]),
    ].sort()
    const days =
      filter.from && filter.to
        ? enumerateDays(filter.from, filter.to)
        : seenDays.length > 0
          ? enumerateDays(seenDays[0], seenDays[seenDays.length - 1])
          : []

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

    // 종류별 상위 10개. 종류를 섞어 자르면 호출이 잦은 한 종류가 목록을 독식한다.
    const resourcesByKind = new Map<InvocationKindKey, Array<{ label: string; count: number }>>()
    for (const row of resources) {
      const key = kindKey(row.kind)
      const list = resourcesByKind.get(key) ?? []
      list.push({ label: resourceLabel(row), count: row.count })
      resourcesByKind.set(key, list)
    }
    for (const [key, list] of resourcesByKind) {
      resourcesByKind.set(key, list.sort((a, b) => b.count - a.count).slice(0, 10))
    }

    return {
      summary,
      resourcesByKind,
      dailyTokens,
      kindCount,
      days,
      kindByDay,
      tokenByDay,
      topProjects,
      projectByKind,
      totalTokens,
      totalInvocations: summary?.invocations ?? 0,
    }
  }, [data, filter])

  // ── 차트 데이터 ────────────────────────────────────────────────────────────

  // 화면에 세울 종류 — 서버가 내려준 분포는 항상 전체라 여기서 범위를 적용한다.
  const visibleKinds = INVOCATION_KIND_ORDER.filter(
    (k) => scope === 'all' || (k !== 'TOOL' && k !== UNCLASSIFIED),
  )
  const excludedKinds = INVOCATION_KIND_ORDER.filter((k) => !visibleKinds.includes(k)).filter(
    (k) => (derived.kindCount.get(k) ?? 0) > 0,
  )

  // 0건인 종류는 빼되 색은 종류에 붙여 뽑는다 — 걸러진 뒤 색을 순서대로 매기면 밀린다.
  const kindSlices = visibleKinds
    .map((key) => ({
      key,
      name: INVOCATION_KIND_STYLE[key].label,
      value: derived.kindCount.get(key) ?? 0,
    }))
    .filter((s) => s.value > 0)

  const doughnutData: CategoryDoughnutChartView = kindSlices.map(({ name, value }) => ({ name, value }))
  const doughnutColors = kindSlices.map((s) => kindColor(s.key))

  const activeDayKinds = visibleKinds.map((key) => ({
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

  const activeProjectKinds = visibleKinds.map((key) => ({
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
      {/* 필터 한 줄 — 조회 기간과 종류 범위. 아래 카드·차트 전부가 이 조건을 본다 */}
      <div className="flex items-center gap-4 flex-wrap">
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

        <div className="flex items-center gap-1.5">
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setScope(opt.key)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-md border transition-colors',
                scope === opt.key
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
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
          sub={[
            kindSlices.map((s) => `${s.name} ${s.value}`).join(' · ') || '집계 없음',
            excludedKinds.length > 0
              ? `제외 ${excludedKinds
                  .map((k) => `${INVOCATION_KIND_STYLE[k].label} ${derived.kindCount.get(k)}`)
                  .join(' · ')}`
              : null,
          ]
            .filter(Boolean)
            .join(' / ')}
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
          <ChartCard title="종류별 분포">
            <DoughnutChart
              data={doughnutData}
              height="260px"
              colors={doughnutColors}
              theme={chartTheme}
            />
          </ChartCard>

          {/*
            종류별 순위를 따로 세운다. 하나로 합치면 호출이 잦은 종류가 목록을
            독식해 스킬·MCP 는 아예 보이지 않는다. 막대 색은 그 종류의 색이라
            어느 순위표를 보고 있는지 제목을 읽지 않아도 안다.
          */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {RANK_PANELS.filter((p) => visibleKinds.includes(p.kind)).map((panel) => {
              const rows = derived.resourcesByKind.get(panel.kind) ?? []
              return (
                <ChartCard
                  key={panel.kind}
                  title={panel.title}
                  actions={
                    <ChartNote>{rows.length > 0 ? `상위 ${rows.length}개 · 이름은 호버` : '호출 없음'}</ChartNote>
                  }
                >
                  {rows.length > 0 ? (
                    <BarChart
                      data={{
                        categories: rows.map((r) => r.label),
                        series: [{ name: '호출 횟수', data: rows.map((r) => r.count) }],
                      }}
                      height="260px"
                      colors={[kindColor(panel.kind)]}
                      theme={chartTheme}
                      unit="회"
                      integerValues
                      hideCategoryLabels
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-16">
                      이 기간에 호출 없음
                    </p>
                  )}
                </ChartCard>
              )
            })}
          </div>

          {/*
            토큰 4종은 자릿수가 다르다(캐시 읽기 100M 대 입력 100K 대). 한 축에 겹치면
            캐시 읽기 한 줄만 보이고 나머지는 바닥에 눌린다. 축을 두 개로 나누는 건
            눈금 두 개를 겹쳐 읽게 만드는 속임수라, 축은 하나로 두고 패널을 나눈다
            (small multiples) — 날짜 축은 공유하고 값 축만 각자 스케일을 갖는다.
          */}
          <ChartCard
            title="토큰 사용량 추이"
            actions={<ChartNote>{`합계 ${compactTokens(derived.totalTokens)} · 패널마다 값 축 스케일이 다르다`}</ChartNote>}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {TOKEN_SERIES.map((s) => (
                <div key={s.key}>
                  <div className="flex items-baseline gap-2 px-1">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: dark ? s.dark : s.light }}
                    />
                    <span className="text-xs">{s.label}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">
                      {compactTokens(tokenTotal(derived.dailyTokens, s.key))}
                    </span>
                  </div>
                  <DateLineChart
                    data={tokenPanelData(derived.days, derived.tokenByDay, s.key, s.label)}
                    height="150px"
                    colors={[dark ? s.dark : s.light]}
                    theme={chartTheme}
                    valueFormat={compactTokens}
                    labelRotate={derived.days.length > 10 ? 45 : 0}
                  />
                </div>
              ))}
            </div>
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
                integerValues
              />
            </ChartCard>
          )}
        </>
      )}
    </div>
  )
}

/** small multiple 한 칸의 데이터. 날짜 축은 전 패널이 공유하고 값만 종류별로 뽑는다. */
function tokenPanelData(
  days: string[],
  byDay: Map<string, DailyTokenRow>,
  key: (typeof TOKEN_SERIES)[number]['key'],
  label: string,
): DateLineChartView {
  return {
    timestamps: days,
    series: [
      {
        name: label,
        dataPoints: days.map((d) => ({ timestamp: d, requests: byDay.get(d)?.[key] ?? 0 })),
      },
    ],
  }
}

/** 토큰 종류별 기간 합계. 카드 부제와 차트가 같은 수를 보게 한 곳에서 더한다. */
function tokenTotal(
  rows: Array<{ inputTokens: number; outputTokens: number; cacheRead: number; cacheCreation: number }>,
  key: (typeof TOKEN_SERIES)[number]['key'],
): number {
  return rows.reduce((sum, r) => sum + r[key], 0)
}
