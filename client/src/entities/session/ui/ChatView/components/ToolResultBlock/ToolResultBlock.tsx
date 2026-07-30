import { useState } from 'react'
import { cn } from '@/shared/lib/utils'
import type { AssistantBlock } from '@/entities/session/model/groupChatTurns'
import { BLOCK_CONFIG } from '@/entities/session/ui/ChatView/blockConfig'
import { Icon } from '@/entities/session/ui/ChatView/components/Icon'
import { ChevronIcon } from '@/entities/session/ui/ChatView/components/ChevronIcon'

export function ToolResultBlock({ block }: { block: AssistantBlock }) {
  const [open, setOpen] = useState(false)
  const isError = block.category === 'tool-result-error'
  const cfg = BLOCK_CONFIG[block.category as 'tool-result-ok' | 'tool-result-error']
  const preview = block.content.split('\n')[0].slice(0, 100)

  return (
    <div className={cn('rounded-lg overflow-hidden', cfg.accentBorder, cfg.accentBg)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Icon path={cfg.icon} className={cfg.iconColor} />
        <span className={cn('text-xs font-semibold', cfg.labelColor)}>{cfg.label}</span>
        <code className="text-xs font-mono text-muted-foreground px-1.5 ml-1 opacity-70">
          {block.label}
        </code>
        {!open && (
          <span className="text-xs text-muted-foreground truncate flex-1 ml-1 opacity-60">
            {preview}
          </span>
        )}
        <ChevronIcon open={open} className="ml-auto shrink-0" />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <pre
            className={cn(
              'text-xs font-mono whitespace-pre-wrap break-words leading-relaxed rounded p-2',
              isError
                ? 'text-rose-700 dark:text-rose-300 bg-rose-500/5'
                : 'text-foreground/75 bg-background/60 dark:bg-black/20',
            )}
          >
            {block.content}
          </pre>
        </div>
      )}
    </div>
  )
}
