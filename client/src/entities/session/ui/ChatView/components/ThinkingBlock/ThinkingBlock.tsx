import { useState } from 'react'
import { cn } from '@/shared/lib/utils'
import type { AssistantBlock } from '@/entities/session/model/groupChatTurns'
import { BLOCK_CONFIG } from '@/entities/session/ui/ChatView/blockConfig'
import { Icon } from '@/entities/session/ui/ChatView/components/Icon'
import { ChevronIcon } from '@/entities/session/ui/ChatView/components/ChevronIcon'

export function ThinkingBlock({ block }: { block: AssistantBlock }) {
  const [open, setOpen] = useState(false)
  const cfg = BLOCK_CONFIG.thinking

  return (
    <div className={cn('rounded-lg overflow-hidden', cfg.accentBorder, cfg.accentBg)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Icon path={cfg.icon} className={cfg.iconColor} />
        <span className={cn('text-xs font-semibold', cfg.labelColor)}>{cfg.label}</span>
        <span className="text-xs text-muted-foreground ml-1 opacity-70">
          {block.content.length > 0
            ? `${block.content.split(' ').length} words`
            : 'empty'}
        </span>
        <ChevronIcon open={open} className="ml-auto" />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed font-mono italic">
            {block.content}
          </pre>
        </div>
      )}
    </div>
  )
}
