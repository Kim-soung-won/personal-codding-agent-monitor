import { useState } from 'react'
import { cn } from '@/shared/lib/utils'

// ─── Model pricing ────────────────────────────────────────────────────────────

interface ModelPricing {
  id: string
  label: string
  sublabel: string
  inputPerM: number
  outputPerM: number
  cacheWritePerM: number
  cacheReadPerM: number
}

const MODELS: ModelPricing[] = [
  {
    id: 'haiku-4-5',
    label: 'Haiku 4.5',
    sublabel: 'Fast · Lightweight',
    inputPerM:      0.80,
    outputPerM:     4.00,
    cacheWritePerM: 1.00,
    cacheReadPerM:  0.08,
  },
  {
    id: 'sonnet-4-6',
    label: 'Sonnet 4.6',
    sublabel: 'Balanced · Default',
    inputPerM:      3.00,
    outputPerM:     15.00,
    cacheWritePerM: 3.75,
    cacheReadPerM:  0.30,
  },
  {
    id: 'opus-4-8',
    label: 'Opus 4.8',
    sublabel: 'Max Intelligence',
    inputPerM:      15.00,
    outputPerM:     75.00,
    cacheWritePerM: 18.75,
    cacheReadPerM:  1.50,
  },
]

// ─── Operation definitions ────────────────────────────────────────────────────

type OpCategory = 'tokenize' | 'tool' | 'context' | 'agent' | 'cache'

interface OpRow {
  name: string
  tokens: string
  /** Returns { low, high } in USD given model pricing */
  costFn: (p: ModelPricing) => { low: number; high: number } | null
  note?: string
  category: OpCategory
}

const c = (inLow: number, inHigh: number, outLow: number, outHigh: number) =>
  (p: ModelPricing) => ({
    low:  (inLow  * p.inputPerM  + outLow  * p.outputPerM) / 1_000_000,
    high: (inHigh * p.inputPerM  + outHigh * p.outputPerM) / 1_000_000,
  })

const OPERATIONS: OpRow[] = [
  // ── 토큰화 ────────────────────────────────────────────────────────────────
  { category: 'tokenize', name: '영어 단어 1개',       tokens: '~1.3 T',     costFn: () => null, note: 'Hello=1T, programmer=2T' },
  { category: 'tokenize', name: '한국어 글자 1개',      tokens: '~0.5–1 T',   costFn: () => null, note: '영어 대비 ~2× 토큰 소모' },
  { category: 'tokenize', name: '코드 1줄 (평균)',      tokens: '~5–15 T',    costFn: () => null, note: '들여쓰기·구두점 포함' },
  { category: 'tokenize', name: '1 KB 텍스트',         tokens: '~300–500 T', costFn: c(400, 400, 0, 0),  note: 'input 기준' },
  { category: 'tokenize', name: '1 MB 텍스트',         tokens: '~300K T',    costFn: c(300_000, 300_000, 0, 0), note: '컨텍스트 한계 초과 위험' },

  // ── 도구 호출 ─────────────────────────────────────────────────────────────
  // tool_use 생성(out) + tool_result 전달(in) 합산
  { category: 'tool', name: 'Read  ·  1 KB 파일',    tokens: '~350 T',    costFn: c(300, 300, 50, 80) },
  { category: 'tool', name: 'Read  ·  10 KB 파일',   tokens: '~3,050 T',  costFn: c(3_000, 3_000, 50, 80) },
  { category: 'tool', name: 'Read  ·  100 KB 파일',  tokens: '~30K T',    costFn: c(30_000, 30_000, 50, 80), note: '비용 급증 구간' },
  { category: 'tool', name: 'Edit  ·  짧은 변경',     tokens: '~600–1K T', costFn: c(300, 500, 300, 600),   note: 'old/new string 모두 포함' },
  { category: 'tool', name: 'Write ·  새 파일 100줄', tokens: '~800 T',    costFn: c(100, 100, 700, 800) },
  { category: 'tool', name: 'Bash  ·  짧은 출력',     tokens: '~150 T',    costFn: c(100, 200, 50, 80) },
  { category: 'tool', name: 'Bash  ·  긴 출력 (로그)', tokens: '~5K T',    costFn: c(4_500, 5_500, 50, 100), note: 'stdout 전량 포함' },
  { category: 'tool', name: 'Grep / Glob',           tokens: '~100–500 T', costFn: c(80, 400, 30, 80) },
  { category: 'tool', name: 'WebSearch  ·  1회',     tokens: '~2K T',      costFn: c(1_500, 2_000, 50, 100), note: '검색 결과 청크 포함' },

  // ── 컨텍스트 주입 ─────────────────────────────────────────────────────────
  // 매 턴 input에 포함되는 구조
  { category: 'context', name: 'CLAUDE.md  (~1 KB)',         tokens: '~350 T',       costFn: c(350, 350, 0, 0),       note: '매 API 호출마다 포함' },
  { category: 'context', name: 'rules 파일 1개  (~2 KB)',    tokens: '~600 T',       costFn: c(600, 600, 0, 0),       note: 'nested_memory 주입' },
  { category: 'context', name: 'hook_success 응답',          tokens: '~200–1K T',    costFn: c(200, 1_000, 0, 0),     note: 'PostToolUse·SessionStart 훅' },
  { category: 'context', name: '스킬 정의 주입',              tokens: '~2K–8K T',     costFn: c(2_000, 8_000, 0, 0),   note: 'SKILL.md 전문 + 예시' },
  { category: 'context', name: 'system-reminder',            tokens: '~500 T',       costFn: c(500, 500, 0, 0),       note: '모든 어시스턴트 턴에 삽입' },
  { category: 'context', name: 'IDE context (파일 열림)',     tokens: '~300–2K T',    costFn: c(300, 2_000, 0, 0),     note: 'ide_opened_file 태그' },

  // ── 에이전트 ──────────────────────────────────────────────────────────────
  { category: 'agent', name: '단순 질문 1턴 (context 포함)',  tokens: '~10K–30K T',   costFn: c(8_000, 20_000, 2_000, 10_000) },
  { category: 'agent', name: '긴 세션 (누적 컨텍스트)',       tokens: '~50K–200K T',  costFn: c(40_000, 150_000, 10_000, 50_000), note: '턴이 쌓일수록 선형 증가' },
  { category: 'agent', name: 'Subagent  ·  Explore 타입',    tokens: '~20K–100K T',  costFn: c(15_000, 70_000, 5_000, 30_000),  note: '독립 컨텍스트 = 별도 과금' },
  { category: 'agent', name: 'Subagent  ·  code-change',     tokens: '~100K–500K T', costFn: c(80_000, 350_000, 20_000, 150_000) },
  { category: 'agent', name: 'feature-planner 1회',          tokens: '~100K–300K T', costFn: c(80_000, 200_000, 20_000, 100_000), note: '코드베이스 탐색 포함' },
  { category: 'agent', name: 'plan-critic 1회',              tokens: '~50K–150K T',  costFn: c(40_000, 100_000, 10_000, 50_000) },
  { category: 'agent', name: 'Workflow  ·  N agents 병렬',   tokens: 'N × subagent', costFn: () => null, note: '비용 선형 증가' },

  // ── 캐시 효과 ─────────────────────────────────────────────────────────────
  { category: 'cache', name: 'Cache HIT  (재사용)',           tokens: '비용 ×0.10',   costFn: () => null, note: 'Input 대비 10× 절약' },
  { category: 'cache', name: 'Cache WRITE (첫 캐싱)',         tokens: '비용 ×1.25',   costFn: () => null, note: '다음 턴부터 HIT 적용' },
  { category: 'cache', name: '일반 세션 캐시 히트율',          tokens: '70–90 %',      costFn: () => null, note: 'CLAUDE.md·rules 반복 참조' },
]

// ─── Category meta ────────────────────────────────────────────────────────────

const CAT_META: Record<OpCategory, { label: string; color: string; dot: string }> = {
  tokenize: { label: '토큰화 기초',   color: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' },
  tool:     { label: '도구 호출',     color: 'text-amber-600 dark:text-amber-400',   dot: 'bg-amber-500' },
  context:  { label: '컨텍스트 주입', color: 'text-sky-600 dark:text-sky-400',       dot: 'bg-sky-500' },
  agent:    { label: '에이전트',      color: 'text-rose-600 dark:text-rose-400',     dot: 'bg-rose-500' },
  cache:    { label: '캐시 효과',     color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function costMid(r: { low: number; high: number }) { return (r.low + r.high) / 2 }

function barPct(mid: number): number {
  if (mid <= 0) return 0
  const logMin = Math.log10(0.0001)
  const logMax = Math.log10(10)
  return Math.min(Math.max(((Math.log10(Math.max(mid, 0.0001)) - logMin) / (logMax - logMin)) * 100, 3), 100)
}

function barColor(mid: number): string {
  if (mid <= 0)    return 'bg-muted'
  if (mid < 0.005) return 'bg-emerald-500'
  if (mid < 0.05)  return 'bg-sky-500'
  if (mid < 0.2)   return 'bg-amber-500'
  if (mid < 1.0)   return 'bg-orange-500'
  return 'bg-rose-500'
}

function textColor(mid: number): string {
  if (mid <= 0)    return 'text-muted-foreground'
  if (mid < 0.005) return 'text-emerald-600 dark:text-emerald-400'
  if (mid < 0.05)  return 'text-sky-600 dark:text-sky-400'
  if (mid < 0.2)   return 'text-amber-600 dark:text-amber-400'
  if (mid < 1.0)   return 'text-orange-600 dark:text-orange-400'
  return 'text-rose-600 dark:text-rose-400'
}

function fmtCost(r: { low: number; high: number }): string {
  if (r.low <= 0 && r.high <= 0) return '—'
  if (Math.abs(r.low - r.high) < 0.0001) {
    const v = r.low
    return v < 0.0001 ? '<$0.0001' : `$${v.toFixed(v < 0.01 ? 5 : v < 0.1 ? 4 : 2)}`
  }
  const fmt = (v: number) => v < 0.01 ? v.toFixed(5) : v < 0.1 ? v.toFixed(4) : v.toFixed(2)
  return `$${fmt(r.low)} – $${fmt(r.high)}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModelToggle({
  models,
  selected,
  onChange,
}: {
  models: ModelPricing[]
  selected: string
  onChange: (id: string) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
      {models.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={cn(
            'flex flex-col items-center px-5 py-2 rounded-md text-left transition-all',
            selected === m.id
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="text-sm font-semibold leading-tight">{m.label}</span>
          <span className="text-[10px] opacity-70">{m.sublabel}</span>
        </button>
      ))}
    </div>
  )
}

function PricingStrip({ model }: { model: ModelPricing }) {
  const items = [
    { type: 'Input',       usd: model.inputPerM,      note: '프롬프트·컨텍스트',     barPct: (model.inputPerM / 75) * 100,      color: 'bg-sky-500' },
    { type: 'Cache Write', usd: model.cacheWritePerM, note: '첫 캐시 기록',           barPct: (model.cacheWritePerM / 75) * 100, color: 'bg-amber-500' },
    { type: 'Output',      usd: model.outputPerM,     note: '어시스턴트 생성 텍스트', barPct: (model.outputPerM / 75) * 100,     color: 'bg-rose-500' },
    { type: 'Cache Read',  usd: model.cacheReadPerM,  note: '캐시 재사용',            barPct: (model.cacheReadPerM / 75) * 100,  color: 'bg-emerald-500' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((p) => (
        <div key={p.type} className="rounded-lg border bg-card px-4 py-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {p.type}
          </p>
          <p className="text-xl font-mono font-bold">
            ${p.usd.toFixed(2)}
            <span className="text-xs font-normal text-muted-foreground ml-1">/ 1M tokens</span>
          </p>
          <div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className={cn('h-full rounded-full', p.color)} style={{ width: `${Math.max(p.barPct, 1)}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">{p.note}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function SectionDivider({ category }: { category: OpCategory }) {
  const meta = CAT_META[category]
  return (
    <tr>
      <td colSpan={4} className="pt-5 pb-1 px-3">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dot)} />
          <span className={cn('text-[11px] font-bold uppercase tracking-widest', meta.color)}>
            {meta.label}
          </span>
        </div>
      </td>
    </tr>
  )
}

function OpRow({ row, model }: { row: OpRow; model: ModelPricing }) {
  const cost = row.costFn(model)
  const mid = cost ? costMid(cost) : 0
  const pct = barPct(mid)

  return (
    <tr className="hover:bg-muted/30 transition-colors border-b border-border/40 last:border-0">
      <td className="py-2 pl-3 pr-4 text-sm font-mono text-foreground/90 whitespace-nowrap">
        {row.name}
      </td>
      <td className="py-2 px-4 text-right text-[11px] font-mono text-muted-foreground whitespace-nowrap">
        {row.tokens}
      </td>
      <td className="py-2 px-4 min-w-[180px]">
        {cost ? (
          <div className="flex items-center gap-2">
            <span className={cn('text-[11px] font-mono font-semibold w-36 text-right shrink-0', textColor(mid))}>
              {fmtCost(cost)}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden min-w-[60px]">
              <div className={cn('h-full rounded-full', barColor(mid))} style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground pl-1">—</span>
        )}
      </td>
      <td className="py-2 pl-2 pr-3 text-[11px] text-muted-foreground/70 hidden sm:table-cell">
        {row.note}
      </td>
    </tr>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function WelcomeDashboard() {
  const [selectedModelId, setSelectedModelId] = useState('sonnet-4-6')
  const model = MODELS.find((m) => m.id === selectedModelId) ?? MODELS[1]

  const categories = Array.from(new Set(OPERATIONS.map((r) => r.category))) as OpCategory[]

  const outputInputRatio = model.outputPerM / model.inputPerM
  const cacheInputRatio  = model.inputPerM  / model.cacheReadPerM

  return (
    <div className="max-w-4xl mx-auto py-8 px-2 space-y-10">

      {/* Header + Model Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Claude Code 비용 가이드</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            모든 프로그래머가 알아야 할 Claude Code Latency Numbers
          </p>
        </div>
        <ModelToggle models={MODELS} selected={selectedModelId} onChange={setSelectedModelId} />
      </div>

      {/* Pricing strip */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          {model.label} 단가
        </h2>
        <PricingStrip model={model} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          <span className="text-rose-500 font-semibold">Output</span>은{' '}
          <span className="text-sky-500 font-semibold">Input</span>의{' '}
          <strong>{outputInputRatio.toFixed(0)}×</strong>
          {' · '}
          <span className="text-sky-500 font-semibold">Input</span>은{' '}
          <span className="text-emerald-500 font-semibold">Cache Read</span>의{' '}
          <strong>{cacheInputRatio.toFixed(0)}×</strong>
        </p>
      </section>

      {/* Operation table */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          연산별 비용 — {model.label} · 로그 스케일 바
        </h2>

        <div className="flex items-center gap-4 mb-3 flex-wrap">
          {[
            { label: '< $0.005',    color: 'bg-emerald-500' },
            { label: '$0.005–0.05', color: 'bg-sky-500' },
            { label: '$0.05–0.2',   color: 'bg-amber-500' },
            { label: '$0.2–1',      color: 'bg-orange-500' },
            { label: '> $1',        color: 'bg-rose-500' },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className={cn('w-2.5 h-2.5 rounded-sm', l.color)} />
              {l.label}
            </span>
          ))}
        </div>

        <div className="rounded-lg border overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="py-2 pl-3 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">연산</th>
                <th className="py-2 px-4 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">토큰 (추산)</th>
                <th className="py-2 px-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">비용 / 호출</th>
                <th className="py-2 pl-2 pr-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">비고</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <>
                  <SectionDivider key={`div-${cat}`} category={cat} />
                  {OPERATIONS.filter((r) => r.category === cat).map((row) => (
                    <OpRow key={row.name} row={row} model={model} />
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Key insights */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          핵심 법칙
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              title: '큰 파일 = 큰 비용',
              body: `Read 100KB 파일 한 번 = $${((30_000 * model.inputPerM + 80 * model.outputPerM) / 1_000_000).toFixed(2)}. 필요한 범위만 읽고 offset·limit을 활용하라.`,
              border: 'border-l-rose-500',
            },
            {
              title: '출력이 가장 비싸다',
              body: `Output은 Input의 ${outputInputRatio.toFixed(0)}×. 간결한 지시일수록 응답 토큰이 줄어 비용이 내려간다.`,
              border: 'border-l-amber-500',
            },
            {
              title: '캐시가 핵심 레버',
              body: `두 번째 참조부터 Cache Read($${model.cacheReadPerM.toFixed(2)}/M). 동일 세션에서 반복 파일 읽기는 ${cacheInputRatio.toFixed(0)}× 절약.`,
              border: 'border-l-emerald-500',
            },
            {
              title: 'Subagent는 배수다',
              body: 'N개 병렬 에이전트 = N× 비용. Workflow는 각 에이전트가 독립 컨텍스트를 가진다.',
              border: 'border-l-rose-500',
            },
            {
              title: '한국어는 2× 토큰',
              body: '동일 내용을 한국어로 쓰면 영어 대비 약 2배 토큰을 소모한다. 프롬프트 길이 최소화가 중요.',
              border: 'border-l-violet-500',
            },
            {
              title: '컨텍스트 누적에 주의',
              body: '세션이 길어질수록 매 턴의 input 비용이 선형 증가. 긴 작업은 서브에이전트로 분리하라.',
              border: 'border-l-sky-500',
            },
          ].map((ins) => (
            <div key={ins.title} className={cn('rounded-lg border bg-card px-4 py-3 border-l-[3px]', ins.border)}>
              <p className="text-sm font-semibold mb-1">{ins.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{ins.body}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-muted-foreground/60 text-center pb-4">
        비용은 추산값입니다 · 실제 토큰 수는 모델·포맷·언어에 따라 달라집니다 · 왼쪽 사이드바에서 세션을 선택하면 실측 데이터를 확인할 수 있습니다
      </p>
    </div>
  )
}
