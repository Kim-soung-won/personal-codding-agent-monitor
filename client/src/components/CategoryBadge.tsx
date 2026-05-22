import { cn } from '../lib/utils'
import { BADGE_COLORS } from '../lib/categories'

interface Props {
  category: string
  className?: string
}

export function CategoryBadge({ category, className }: Props) {
  return (
    <span
      className={cn(
        'text-xs px-1.5 py-0.5 rounded shrink-0',
        BADGE_COLORS[category] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {category}
    </span>
  )
}
