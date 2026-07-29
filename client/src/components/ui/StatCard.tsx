import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { InfoHint } from './InfoHint'

export type StatTone = 'default' | 'good' | 'warn' | 'bad'

const TONE_CLASS: Record<StatTone, string> = {
  default: 'text-foreground',
  good: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
}

interface Props {
  label: string
  value: string | number
  sub?: ReactNode
  tone?: StatTone
  icon?: ReactNode
  /** 라벨 옆 ⓘ 에 얹는 설명. 지표가 무엇을 뜻하고 왜 보는지 사용자 관점으로 적는다. */
  hint?: string
}

/** 분석 대시보드용 지표 카드. */
export function StatCard({ label, value, sub, tone = 'default', icon, hint }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          {label}
          {hint && <InfoHint>{hint}</InfoHint>}
        </p>
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      </div>
      <p className={cn('text-2xl font-bold tabular-nums leading-tight', TONE_CLASS[tone])}>{value}</p>
      {sub != null && <p className="text-2xs text-muted-foreground leading-snug">{sub}</p>}
    </div>
  )
}
