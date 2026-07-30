import { cn } from '@/shared/lib/utils'

/** 블록 헤더용 SVG 글리프. path 하나를 받아 그린다. */
export function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      className={cn('w-3.5 h-3.5 shrink-0', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  )
}
