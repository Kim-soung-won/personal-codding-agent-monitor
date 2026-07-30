import { cn } from '@/shared/lib/utils'
import type { SessionQuality } from '@/lib/sessionQuality'

interface Props {
  quality: SessionQuality
  cacheHitRate: number
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

/** 값이 나쁠수록 붉게. 임계값은 경험적 기준이며 절대적이지 않다. */
function toneFor(value: number, warn: number, bad: number): string {
  if (value >= bad) return 'text-rose-500'
  if (value >= warn) return 'text-amber-500'
  return 'text-emerald-500'
}

function Row({
  label,
  value,
  tone,
  detail,
  warn,
}: {
  label: string
  value: string
  tone?: string
  detail?: string
  warn?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <div className="flex items-center gap-1.5 min-w-0">
        {warn && <span className="text-amber-500 text-xs shrink-0">⚠</span>}
        <span className="text-xs text-muted-foreground truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 shrink-0">
        {detail && <span className="text-[10px] text-muted-foreground/70 font-mono">{detail}</span>}
        <span className={cn('text-sm font-mono font-bold', tone ?? 'text-foreground')}>{value}</span>
      </div>
    </div>
  )
}

/** 파일 경로에서 파일명만 (동명이인이 있으면 상위 디렉토리까지) */
function shortPath(path: string): string {
  const parts = path.split('/')
  return parts.slice(-2).join('/')
}

export function SessionQualityCard({ quality: q, cacheHitRate }: Props) {
  const hasRework = q.reworkFiles.length > 0
  const hasRepeats = q.repeatedCommands.length > 0

  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
        세션 품질 — 낭비 신호
      </p>

      <div className="rounded-lg border bg-card divide-y overflow-hidden">
        <Row
          label="캐시 적중률"
          value={pct(cacheHitRate)}
          tone={cacheHitRate >= 0.8 ? 'text-emerald-500' : cacheHitRate >= 0.5 ? 'text-amber-500' : 'text-rose-500'}
          detail="높을수록 좋음"
        />
        <Row
          label="tool 실패율"
          value={pct(q.toolFailureRate)}
          tone={toneFor(q.toolFailureRate, 0.05, 0.15)}
          detail={`${q.toolErrors}/${q.toolResults}`}
        />
        <Row
          label="재작업 파일"
          value={hasRework ? `${q.reworkFiles.length}개` : '없음'}
          tone={hasRework ? 'text-amber-500' : 'text-emerald-500'}
          warn={hasRework}
          detail={hasRework ? `최다 ${q.reworkFiles[0].count}회` : undefined}
        />
        <Row
          label="반복 명령"
          value={hasRepeats ? `${q.repeatedCommands[0].count}회` : '없음'}
          tone={hasRepeats && q.repeatedCommands[0].count >= 10 ? 'text-rose-500' : hasRepeats ? 'text-amber-500' : 'text-emerald-500'}
          warn={hasRepeats}
        />
        <Row
          label="thinking 비중"
          value={pct(q.thinkingRatio)}
          detail={`${q.thinkingTurns}/${q.assistantTurns} 턴`}
        />
      </div>

      {/* 상세: 어떤 파일/명령이 반복됐는지 */}
      {(hasRework || hasRepeats) && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {hasRework && (
            <div className="rounded-lg border bg-card/50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                반복 편집된 파일
              </p>
              <ul className="space-y-1">
                {q.reworkFiles.map((f) => (
                  <li key={f.path} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="font-mono truncate text-muted-foreground" title={f.path}>
                      {shortPath(f.path)}
                    </span>
                    <span className="font-mono font-bold text-amber-500 shrink-0">{f.count}회</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasRepeats && (
            <div className="rounded-lg border bg-card/50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                반복 실행된 명령
              </p>
              <ul className="space-y-1">
                {q.repeatedCommands.map((c) => (
                  <li key={c.command} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="font-mono truncate text-muted-foreground" title={c.command}>
                      {c.command}
                    </span>
                    <span className="font-mono font-bold text-amber-500 shrink-0">{c.count}회</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex items-start gap-1.5 px-1">
        <svg className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-[11px] text-muted-foreground">
          토큰을 적게 쓰는 것이 아니라 <span className="font-semibold">헛되이 쓰지 않는 것</span>을 봅니다.
          thinking 비중은 좋고 나쁨이 아니라 성향 지표입니다 — 많이 생각하고 한 번에 맞힌 세션이
          적게 생각하고 세 번 고친 세션보다 낫습니다.
        </p>
      </div>
    </section>
  )
}
