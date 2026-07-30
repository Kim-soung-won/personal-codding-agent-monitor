import { cn } from '@/shared/lib/utils'

/** 펼침/접힘 상태를 표시하는 셰브론 글리프. */
export function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 shrink-0', open && 'rotate-180', className)}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}
