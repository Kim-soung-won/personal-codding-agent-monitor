import { useMemo } from 'react'
import { cn } from '../lib/utils'
import { calcCostUsd, readUsage } from '@shared/pricing'
import { calcSessionQuality } from '../lib/sessionQuality'
import { SessionQualityCard } from './SessionQualityCard'
import type { EventOrigin, NormalizedEvent } from '../types/events'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PerCallUsage {
  ctxSize: number   // in + cw + cr  (total context window for this call)
  output: number
  input: number
  cacheCreate: number
  cacheRead: number
  model: string | undefined
  origin: EventOrigin
  agentId: string | undefined
}

interface Stats {
  input: number
  output: number
  cacheCreate: number
  cacheRead: number
  turnCount: number
  perCall: PerCallUsage[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * 요청(requestId) 단위로 집계한다.
 *
 * 한 API 응답이 content block별로 여러 JSONL 라인에 쪼개져 기록되고 각 라인이
 * 같은 usage를 반복해 갖는다. 라인 단위로 세면 토큰이 배로 부풀려지므로
 * 요청당 최종 라인(output_tokens 최대) 하나만 남긴다.
 */
function calcStats(events: NormalizedEvent[]): Stats {
  const byRequest = new Map<string, PerCallUsage>()
  let fallbackKey = 0

  for (const ev of events) {
    const entry = readUsage(ev.raw)
    if (!entry) continue

    const { inputTokens: i, outputTokens: o, cacheWrite: cw, cacheRead: cr } = entry.usage
    const call: PerCallUsage = {
      ctxSize: i + cw + cr,
      output: o,
      input: i,
      cacheCreate: cw,
      cacheRead: cr,
      model: entry.model,
      origin: ev.origin ?? 'main',
      agentId: ev.agentId,
    }

    const key = entry.requestId ?? `__no-request-${fallbackKey++}`
    const prev = byRequest.get(key)
    if (!prev || call.output > prev.output) byRequest.set(key, call)
  }

  const perCall = [...byRequest.values()]
  return {
    input: perCall.reduce((s, c) => s + c.input, 0),
    output: perCall.reduce((s, c) => s + c.output, 0),
    cacheCreate: perCall.reduce((s, c) => s + c.cacheCreate, 0),
    cacheRead: perCall.reduce((s, c) => s + c.cacheRead, 0),
    turnCount: perCall.length,
    perCall,
  }
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtUsd(n: number): string {
  if (n < 0.01) return '<$0.01'
  return `$${n.toFixed(2)}`
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function CtxSparkline({ perCall }: { perCall: PerCallUsage[] }) {
  if (perCall.length < 2) return null

  const W = 600, H = 56
  const maxCtx = Math.max(...perCall.map(c => c.ctxSize))
  // Sample up to 120 points for performance
  const step = Math.max(1, Math.floor(perCall.length / 120))
  const sampled = perCall.filter((_, i) => i % step === 0 || i === perCall.length - 1)

  const pts = sampled.map((c, i) => {
    const x = (i / (sampled.length - 1)) * W
    const y = H - (c.ctxSize / maxCtx) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const areaPath =
    `M0,${H} ` +
    pts.map((p, i) => (i === 0 ? `L${p}` : `L${p}`)).join(' ') +
    ` L${W},${H} Z`

  const linePath = `M${pts.join(' L')}`

  // Milestone markers: 25%, 50%, 75%, 100% of turns
  const milestones = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const idx = Math.min(Math.round(pct * (perCall.length - 1)), perCall.length - 1)
    return { pct, ctx: perCall[idx].ctxSize, turn: idx + 1 }
  })

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 56 }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="ctxGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(139,92,246)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(139,92,246)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#ctxGrad)" />
        <path d={linePath} fill="none" stroke="rgb(139,92,246)" strokeWidth="1.5" />
      </svg>

      {/* Milestone labels */}
      <div className="flex justify-between mt-1">
        {milestones.map(m => (
          <div key={m.pct} className="flex flex-col items-center">
            <span className="text-[9px] font-mono text-muted-foreground">
              Turn {m.turn}
            </span>
            <span className="text-[10px] font-mono font-semibold text-violet-500">
              {fmt(m.ctx)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  events: NormalizedEvent[]
}

function costOf(calls: PerCallUsage[]): number {
  return calls.reduce(
    (sum, c) =>
      sum +
      calcCostUsd(
        {
          inputTokens: c.input,
          outputTokens: c.output,
          cacheWrite: c.cacheCreate,
          cacheRead: c.cacheRead,
        },
        c.model,
      ),
    0,
  )
}

export function TokenDashboard({ events }: Props) {
  const s = useMemo(() => calcStats(events), [events])
  const quality = useMemo(() => calcSessionQuality(events), [events])

  // 서브에이전트 분리 — 부모 세션 집계에 합산되지만 기여분을 따로 보여준다
  const origin = useMemo(() => {
    const main = s.perCall.filter((c) => c.origin === 'main')
    const sub = s.perCall.filter((c) => c.origin === 'subagent')
    const agentIds = new Set(sub.map((c) => c.agentId).filter(Boolean))
    return {
      main,
      sub,
      agentCount: agentIds.size,
      mainCost: costOf(main),
      subCost: costOf(sub),
    }
  }, [s.perCall])

  if (s.turnCount === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        세션을 선택하면 토큰 통계가 표시됩니다
      </p>
    )
  }

  const avgCtxPerCall = s.turnCount > 0
    ? Math.round(s.cacheRead / s.turnCount)
    : 0

  const cacheHitRate = (s.input + s.cacheCreate + s.cacheRead) > 0
    ? (s.cacheRead / (s.input + s.cacheCreate + s.cacheRead)) * 100
    : 0

  // Cost: actual vs hypothetical without cache — 호출별 모델 단가로 합산
  const actualCost = costOf(s.perCall)

  // 캐시가 없었다면 캐시 토큰이 전부 일반 input 으로 청구됐을 것
  const noCacheCost = s.perCall.reduce(
    (sum, c) =>
      sum +
      calcCostUsd(
        {
          inputTokens: c.input + c.cacheCreate + c.cacheRead,
          outputTokens: c.output,
          cacheWrite: 0,
          cacheRead: 0,
        },
        c.model,
      ),
    0,
  )

  const savings = noCacheCost - actualCost

  // Peak context (last call)
  const peakCtx = s.perCall.length > 0
    ? Math.max(...s.perCall.map(c => c.ctxSize))
    : 0

  return (
    <div className="space-y-8 max-w-2xl">

      {/* ── Section 0: 세션 품질 (낭비 신호) ───────────────────────────── */}
      <SessionQualityCard quality={quality} cacheHitRate={cacheHitRate / 100} />

      {/* ── Section 0-1: 메인 vs 서브에이전트 ──────────────────────────── */}
      {origin.sub.length > 0 && (
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
            메인 · 서브에이전트 분리
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-card px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                메인 세션
              </p>
              <p className="text-2xl font-mono font-bold mt-1">{fmtUsd(origin.mainCost)}</p>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                API 요청 {origin.main.length}회
              </p>
            </div>
            <div className="rounded-lg border bg-card px-4 py-3 border-violet-500/40">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-500">
                서브에이전트
              </p>
              <p className="text-2xl font-mono font-bold text-violet-500 mt-1">
                {fmtUsd(origin.subCost)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                API 요청 {origin.sub.length}회 · 에이전트 {origin.agentCount}개
              </p>
            </div>
          </div>

          {/* 비중 바 */}
          <div className="mt-2 h-2 rounded-full overflow-hidden bg-muted flex">
            <div
              className="bg-foreground/40"
              style={{ width: `${(origin.mainCost / Math.max(actualCost, 1e-9)) * 100}%` }}
            />
            <div
              className="bg-violet-500"
              style={{ width: `${(origin.subCost / Math.max(actualCost, 1e-9)) * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 px-1">
            서브에이전트가 전체 비용의{' '}
            <span className="font-mono font-semibold text-violet-500">
              {((origin.subCost / Math.max(actualCost, 1e-9)) * 100).toFixed(1)}%
            </span>
            를 차지합니다. 아래 토큰 통계에는 이미 합산되어 있습니다.
          </p>
        </section>
      )}

      {/* ── Section 1: 실제 생성/처리 ───────────────────────────────────── */}
      <section>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          실제 생성 · 처리한 토큰
        </p>
        <div className="grid grid-cols-3 gap-3">
          {/* Input */}
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Fresh Input
            </p>
            <p className="text-2xl font-mono font-bold text-sky-500 mt-1">{fmt(s.input)}</p>
            <p className="text-[10px] text-muted-foreground mt-1.5">캐시 미적용 신규 입력</p>
          </div>
          {/* Output */}
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Output
            </p>
            <p className="text-2xl font-mono font-bold text-emerald-500 mt-1">{fmt(s.output)}</p>
            <p className="text-[10px] text-muted-foreground mt-1.5">모델이 생성한 텍스트</p>
          </div>
          {/* Cache Creation */}
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cache Write
            </p>
            <p className="text-2xl font-mono font-bold text-amber-500 mt-1">{fmt(s.cacheCreate)}</p>
            <p className="text-[10px] text-muted-foreground mt-1.5">고유 컨텍스트 (1회만 기록)</p>
          </div>
        </div>

        {/* Annotation: cacheCreate = 실제 대화 내용 크기 */}
        <div className="mt-2 flex items-start gap-1.5 px-1">
          <svg className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[11px] text-muted-foreground">
            Cache Write <span className="font-mono font-semibold text-amber-500">{fmt(s.cacheCreate)}</span>이
            이 세션의 실질적인 컨텍스트 크기입니다.
            대화 내용·파일·규칙이 누적되어 캐시에 기록된 총량입니다.
          </p>
        </div>
      </section>

      {/* ── Section 2: Cache Read 누적 설명 ────────────────────────────── */}
      <section>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          캐시 재사용 — 왜 M 단위인가
        </p>

        <div className="rounded-lg border bg-card overflow-hidden">
          {/* 큰 숫자 */}
          <div className="px-4 pt-4 pb-3 flex items-end gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cache Read (누적합)
              </p>
              <p className="text-3xl font-mono font-bold text-violet-500 mt-1">
                {fmt(s.cacheRead)}
              </p>
            </div>
            <div className="pb-1 text-muted-foreground/50 text-xl font-light">=</div>
            {/* 공식 */}
            <div className="pb-1 flex items-center gap-2">
              <div className="text-center">
                <p className="text-base font-mono font-semibold text-foreground/80">
                  {fmt(avgCtxPerCall)}
                </p>
                <p className="text-[9px] text-muted-foreground">avg ctx / call</p>
              </div>
              <span className="text-muted-foreground/50 font-light">×</span>
              <div className="text-center">
                <p className="text-base font-mono font-semibold text-foreground/80">
                  {s.turnCount}
                </p>
                <p className="text-[9px] text-muted-foreground">API calls</p>
              </div>
            </div>
          </div>

          {/* 설명 */}
          <div className="px-4 pb-3 border-t border-border/50 pt-3">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              매 API 호출마다 이전 대화 전체를 캐시에서 다시 읽습니다.
              <span className="text-violet-500 font-semibold"> 같은 토큰이 {s.turnCount}번 반복 카운팅</span>되기
              때문에 합산값이 M 단위로 커집니다.
              단일 호출 기준 최대 컨텍스트는 <span className="font-mono font-semibold text-foreground/80">{fmt(peakCtx)}</span>입니다.
            </p>
          </div>

          {/* 누적 바 시각화 */}
          <div className="px-4 pb-4 border-t border-border/50 pt-3">
            <p className="text-[10px] text-muted-foreground mb-2">
              호출당 컨텍스트 크기 누적 ({fmt(peakCtx)} max)
            </p>
            <CtxSparkline perCall={s.perCall} />
          </div>
        </div>
      </section>

      {/* ── Section 3: 캐시 절약 효과 ──────────────────────────────────── */}
      <section>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          캐시 효과
        </p>

        <div className="grid grid-cols-2 gap-3">
          {/* Hit rate */}
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              캐시 히트율
            </p>
            <p className="text-2xl font-mono font-bold text-violet-500 mt-1">
              {cacheHitRate.toFixed(1)}%
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-violet-400 rounded-full"
                style={{ width: `${cacheHitRate}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              cache_read ÷ 전체 input
            </p>
          </div>

          {/* Cost savings */}
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              캐시로 절약한 비용
            </p>
            <p className="text-2xl font-mono font-bold text-emerald-500 mt-1">
              {fmtUsd(savings)}
            </p>
            <div className="mt-2 space-y-0.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">실제 비용</span>
                <span className="font-mono text-foreground/80">{fmtUsd(actualCost)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">캐시 없을 때</span>
                <span className="font-mono text-rose-500">{fmtUsd(noCacheCost)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Token distribution bar — 실제 의미 있는 분포 */}
        <div className="mt-3 rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] text-muted-foreground mb-2">
            실제 처리 토큰 분포 (cache_read 제외 — 중복 카운팅이므로)
          </p>
          {(() => {
            const base = s.input + s.output + s.cacheCreate
            const segs = [
              { label: 'fresh input', val: s.input,       color: 'bg-sky-400' },
              { label: 'output',      val: s.output,      color: 'bg-emerald-400' },
              { label: 'cache write', val: s.cacheCreate, color: 'bg-amber-400' },
            ]
            return (
              <>
                <div className="flex h-4 rounded overflow-hidden bg-muted">
                  {segs.map(seg => {
                    const pct = base > 0 ? (seg.val / base) * 100 : 0
                    return pct > 0.5
                      ? <div key={seg.label} className={cn('h-full', seg.color)} style={{ width: `${pct}%` }} />
                      : null
                  })}
                </div>
                <div className="flex flex-wrap gap-3 mt-2">
                  {segs.map(seg => {
                    const pct = base > 0 ? (seg.val / base) * 100 : 0
                    return (
                      <span key={seg.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className={cn('w-2.5 h-2.5 rounded-sm', seg.color)} />
                        {seg.label}
                        <span className="text-foreground/70 font-mono">{fmt(seg.val)} ({pct.toFixed(1)}%)</span>
                      </span>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </div>
      </section>
    </div>
  )
}
