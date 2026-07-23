import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface Props {
  title: string
  children: ReactNode
  className?: string
  actions?: ReactNode
}

/** 차트(@we/ai-template)를 감싸는 카드 래퍼. */
export function ChartCard({ title, children, className, actions }: Props) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">{title}</p>
        {actions}
      </div>
      {children}
    </div>
  )
}
