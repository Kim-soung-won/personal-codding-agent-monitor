import { cn } from '@/shared/lib/utils'
import { KIND_STYLES } from '@/shared/lib/resourceKind'

export function FilterChip({
  kind, count, active, onClick,
}: {
  kind: 'skill' | 'agent' | 'workflow' | 'artifact' | 'mcp' | 'all'
  count: number
  active: boolean
  onClick: () => void
}) {
  const style = kind === 'all'
    ? { dot: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/20', label: 'All' }
    : KIND_STYLES[kind]

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
        active
          ? cn(style.badge, 'ring-1 ring-offset-1 ring-offset-background ring-current/30')
          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
      )}
    >
      <div className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
      {style.label}
      <span className={cn('font-mono tabular-nums', active ? '' : 'text-muted-foreground')}>{count}</span>
    </button>
  )
}
