import { CategoryBadge } from '@/components/CategoryBadge'
import type { NormalizedEvent } from '@/types/events'

interface Props {
  events: NormalizedEvent[]
}

export function AllEventsFeed({ events }: Props) {
  return (
    <div className="space-y-1">
      {events.length === 0 && (
        <p className="text-sm text-muted-foreground py-12 text-center">이벤트 없음</p>
      )}
      {events
        .slice()
        .reverse()
        .map((ev) => (
          <div
            key={ev.id}
            className="border rounded px-3 py-2 text-sm font-mono flex items-start gap-3"
          >
            <span className="text-xs text-muted-foreground shrink-0">
              {new Date(ev.timestamp).toLocaleTimeString()}
            </span>
            <CategoryBadge category={ev.category} />
            <span className="truncate text-foreground/80">{ev.summary}</span>
          </div>
        ))}
    </div>
  )
}
