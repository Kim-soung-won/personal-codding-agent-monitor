import { useState } from 'react'
import { cn } from '../lib/utils'
import { CategoryBadge } from './CategoryBadge'
import { DOT_COLORS } from '../lib/categories'
import type { NormalizedEvent, EventCategory } from '../types/events'

const TIMELINE_SET = new Set<EventCategory>([
  'context-injection',
  'tool-use',
  'file-edit',
  'system',
])

interface Props {
  events: NormalizedEvent[]
}

export function Timeline({ events }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filtered = events.filter((e) => TIMELINE_SET.has(e.category))

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">표시할 이벤트 없음</p>
    )
  }

  return (
    <div className="relative pl-7">
      <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
      <div className="space-y-2">
        {filtered.map((ev) => (
          <div key={ev.id} className="relative flex gap-3">
            <div
              className={cn(
                'absolute -left-4 z-10 mt-2.5 w-3 h-3 rounded-full border-2 border-background shrink-0',
                DOT_COLORS[ev.category] ?? 'bg-muted-foreground',
              )}
            />
            <div className="flex-1 border rounded overflow-hidden min-w-0">
              <button
                onClick={() => toggle(ev.id)}
                className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
              >
                <span className="text-xs text-muted-foreground shrink-0 font-mono mt-0.5">
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
                <CategoryBadge category={ev.category} />
                <span className="flex-1 text-sm truncate text-foreground/80">{ev.summary}</span>
              </button>
              {expanded.has(ev.id) && (
                <div className="border-t bg-muted/20 px-3 py-3 max-h-64 overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                    {extractDetail(ev)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function extractDetail(event: NormalizedEvent): string {
  const raw = event.raw as Record<string, unknown>

  if (raw.type === 'attachment') {
    const att = raw.attachment as Record<string, unknown> | undefined
    if (!att) return ''

    if (att.type === 'hook_success') {
      const stdout = String(att.stdout ?? '')
      try {
        return JSON.stringify(JSON.parse(stdout), null, 2)
      } catch {
        return stdout || String(att.stderr ?? '')
      }
    }

    if (att.type === 'nested_memory') {
      const content = att.content as Record<string, unknown> | undefined
      return String(content?.content ?? att.path ?? '')
    }

    if (att.type === 'edited_text_file') {
      return `파일: ${String(att.filename ?? '')}\n\n${String(att.snippet ?? '')}`
    }

    return JSON.stringify(att, null, 2)
  }

  if (raw.type === 'assistant') {
    const msg = raw.message as {
      content?: Array<{ type: string; name?: string; input?: unknown }>
    } | undefined
    const tools = (msg?.content ?? []).filter((i) => i.type === 'tool_use')
    return tools
      .map((t) => `[${String(t.name ?? '')}]\n${JSON.stringify(t.input, null, 2)}`)
      .join('\n\n')
  }

  return JSON.stringify(raw, null, 2)
}
