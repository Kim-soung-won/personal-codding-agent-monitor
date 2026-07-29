import type { SessionHygiene } from '../../types/agentFactory'
import { compactTokens } from '../../lib/format'
import { cn } from '../../lib/utils'

/**
 * "캐시 재사용 — 왜 M 단위인가" 카드.
 *
 * 커밋 델타 스코프로, 저장된 턴별 컨텍스트 시계열(sessionHygiene.contextSeries)을 근거로
 * 매 API 호출마다 이전 컨텍스트를 다시 읽어 cache_read 가 M 단위로 커지는 구조를 보여준다.
 * 컨텍스트가 언제 부풀었는지(초과 비용 시점)를 스파크라인으로 드러낸다.
 */

// 스파크라인 SVG 좌표계(뷰박스). 실제 픽셀 폭은 width:100% 로 늘어난다.
const VB_W = 100
const VB_H = 30

interface JumpMarker {
  turn: number
  label: string
  rebilled: number
  // 도구 결과 유입(tool) vs 사용자가 직접 넣은 대용량 입력(user) — 색으로 구분한다.
  kind: 'tool' | 'user'
}

// 원인 종류별 색(SVG·텍스트 공용). user = 사용자 입력(주황), tool = 도구 결과(빨강).
const KIND_COLOR: Record<JumpMarker['kind'], string> = {
  user: 'rgb(245 158 11)',
  tool: 'rgb(244 63 94)',
}

interface SparklineProps {
  series: Array<[number, number]>
  maxCtx: number
  markers: JumpMarker[]
}

/** 시계열에서 주어진 턴 번호에 가장 가까운 포인트 인덱스를 찾는다. */
function nearestIndex(series: Array<[number, number]>, turn: number): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < series.length; i++) {
    const d = Math.abs(series[i][0] - turn)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

function CtxSparkline({ series, maxCtx, markers }: SparklineProps): JSX.Element {
  const n = series.length
  const denom = n > 1 ? n - 1 : 1
  // x 는 시계열 인덱스 균등 배치(턴 번호 간격이 들쭉날쭉해도 형태를 고르게 본다).
  const toX = (i: number): number => (i / denom) * VB_W
  const toY = (ctx: number): number => VB_H - (maxCtx > 0 ? (ctx / maxCtx) * VB_H : 0)

  const linePts = series.map(([, ctx], i) => `${toX(i).toFixed(2)},${toY(ctx).toFixed(2)}`)
  const areaPath = `M0,${VB_H} L${linePts.join(' L')} L${VB_W},${VB_H} Z`
  const linePath = `M${linePts.join(' L')}`

  // 급상승 마커 — 원인 스파이크의 턴에 점을 찍고 hover 하면 정체(도구·대상·재청구)를 보여준다.
  const points = markers
    .map((m) => {
      const i = nearestIndex(series, m.turn)
      return { m, x: toX(i), y: toY(series[i][1]) }
    })

  // 하단 눈금 — 처음/끝 포함 최대 5개 지점의 턴 번호·컨텍스트 값.
  const milestoneIdx = n <= 5
    ? series.map((_, i) => i)
    : [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(p * (n - 1)))

  return (
    <div>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        className="w-full h-20"
      >
        <path d={areaPath} fill="rgb(139 92 246 / 0.15)" />
        <path
          d={linePath}
          fill="none"
          stroke="rgb(139 92 246)"
          strokeWidth={0.6}
          vectorEffect="non-scaling-stroke"
        />
        {points.map(({ m, x, y }, i) => (
          <g key={i}>
            <line
              x1={x.toFixed(2)}
              y1="0"
              x2={x.toFixed(2)}
              y2={VB_H}
              stroke={KIND_COLOR[m.kind]}
              strokeOpacity={0.35}
              strokeWidth={0.4}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x.toFixed(2)} cy={y.toFixed(2)} r={2.5} fill={KIND_COLOR[m.kind]}>
              <title>{`turn ${m.turn}: ${m.label} · +~${compactTokens(m.rebilled)} tok 재청구`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between">
        {milestoneIdx.map((idx) => (
          <div key={idx} className="text-center">
            <p className="text-[10px] text-muted-foreground">Turn {series[idx][0]}</p>
            <p className="text-[10px] font-mono font-semibold text-violet-500">
              {compactTokens(series[idx][1])}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  h: SessionHygiene
}

export function CacheReuseCard({ h }: Props): JSX.Element | null {
  const series = Array.isArray(h.contextSeries) ? h.contextSeries : []
  const cacheRead = h.cacheRead ?? 0
  // API 호출 수: 저장값 우선, 없으면 시계열 길이로 근사.
  const calls = h.assistantTurns ?? series.length
  const peakCtx = h.maxTurnContext ?? (series.length > 0 ? Math.max(...series.map((p) => p[1])) : 0)
  const avgCtx = calls > 0 ? Math.round(cacheRead / calls) : 0
  const maxCtx = series.length > 0 ? Math.max(...series.map((p) => p[1])) : 0

  // 급상승 원인: 원인 라벨(turn+tool)이 붙은 tool_result 스파이크. 큰 tool_result 가 그 턴에
  // 컨텍스트로 유입돼 계단식 점프를 만든다. rebilled 내림차순(=재청구 비용 큰 순).
  const seriesMinTurn = series.length > 0 ? series[0][0] : 0
  const seriesMaxTurn = series.length > 0 ? series[series.length - 1][0] : 0
  const causes: JumpMarker[] = (Array.isArray(h.toolResultSpikes) ? h.toolResultSpikes : [])
    .filter(
      (s) =>
        typeof s.turn === 'number' && s.turn >= seriesMinTurn && s.turn <= seriesMaxTurn,
    )
    .map((s) => {
      const isUser = s.tool === 'user_input'
      return {
        turn: s.turn as number,
        // 사용자가 직접 넣은 유입은 "사용자 입력"으로, 도구 결과는 "도구 대상"으로.
        label: isUser
          ? '사용자 입력 (프롬프트·붙여넣기)'
          : s.tool
            ? `${s.tool}${s.target ? ` ${s.target}` : ''}`
            : '대용량 결과',
        rebilled: s.rebilled_tokens ?? Math.round(s.len / 4),
        kind: isUser ? ('user' as const) : ('tool' as const),
      }
    })
    .sort((a, b) => b.rebilled - a.rebilled)

  // 시계열이 없으면(구버전 기록) 이 카드를 렌더하지 않는다 — 상세 페이지가 폴백을 처리한다.
  if (series.length === 0 || cacheRead === 0) return null

  return (
    <section className="rounded-xl border border-border bg-card p-4 mb-4">
      <h2 className="text-base font-semibold mb-1">캐시 재사용 — 왜 M 단위인가</h2>
      <p className="text-2xs text-muted-foreground mb-3">
        이 커밋 델타 기준 — 매 호출마다 이전 컨텍스트를 다시 읽어 cache_read 가 누적된다
      </p>

      <div className="rounded-lg border border-border bg-background/40 overflow-hidden">
        {/* 큰 숫자 = avg ctx × calls */}
        <div className="px-4 pt-4 pb-3 flex items-end gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cache Read (누적합)
            </p>
            <p className="text-3xl font-mono font-bold text-violet-500 mt-1 leading-none">
              {compactTokens(cacheRead)}
            </p>
          </div>
          <div className="pb-1 text-muted-foreground/50 text-xl font-light">=</div>
          <div className="pb-1 flex items-center gap-2">
            <div className="text-center">
              <p className="text-base font-mono font-semibold text-foreground/80">
                {compactTokens(avgCtx)}
              </p>
              <p className="text-[9px] text-muted-foreground">avg ctx / call</p>
            </div>
            <span className="text-muted-foreground/50 font-light">×</span>
            <div className="text-center">
              <p className="text-base font-mono font-semibold text-foreground/80">{calls}</p>
              <p className="text-[9px] text-muted-foreground">API calls</p>
            </div>
          </div>
        </div>

        {/* 설명 */}
        <div className="px-4 pb-3 border-t border-border/50 pt-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            매 API 호출마다 이전 대화 전체를 캐시에서 다시 읽습니다.
            <span className="text-violet-500 font-semibold"> 같은 토큰이 {calls}번 반복 카운팅</span>
            되기 때문에 합산값이 커집니다. 단일 호출 기준 최대 컨텍스트는{' '}
            <span className="font-mono font-semibold text-foreground/80">{compactTokens(peakCtx)}</span>
            입니다.
          </p>
        </div>

        {/* 시계열 스파크라인 + 급상승 마커 */}
        <div className="px-4 pb-4 border-t border-border/50 pt-3">
          <p className="text-[10px] text-muted-foreground mb-2">
            호출당 컨텍스트 크기 누적 ({compactTokens(peakCtx)} max)
            {causes.length > 0 && (
              <span className="ml-1">
                · <span className="text-rose-500">빨강=도구 결과</span>
                {causes.some((c) => c.kind === 'user') && (
                  <>
                    {' / '}
                    <span className="text-amber-500">주황=사용자 입력</span>
                  </>
                )}{' '}
                유입 지점
              </span>
            )}
          </p>
          <CtxSparkline series={series} maxCtx={maxCtx} markers={causes} />

          {/* 급상승 원인 — 무엇이 그 턴에 컨텍스트로 들어와 점프를 만들었나 */}
          {causes.length > 0 && (
            <ul className="mt-3 space-y-1">
              {causes.slice(0, 5).map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px]">
                  <span
                    className={cn(
                      'shrink-0 font-mono tabular-nums',
                      c.kind === 'user' ? 'text-amber-500' : 'text-rose-500',
                    )}
                  >
                    turn {c.turn}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-foreground/80">
                    {c.label}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    +~{compactTokens(c.rebilled)} tok 재청구
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
