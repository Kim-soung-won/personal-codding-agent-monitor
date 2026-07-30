import { useState } from 'react'
import { cn } from '@/shared/lib/utils'
import type { AssistantBlock } from '@/entities/session/model/groupChatTurns'
import { BLOCK_CONFIG } from '@/entities/session/ui/ChatView/blockConfig'
import { Icon } from '@/entities/session/ui/ChatView/components/Icon'
import { ChevronIcon } from '@/entities/session/ui/ChatView/components/ChevronIcon'

export function ToolUseBlock({ block }: { block: AssistantBlock }) {
  const [open, setOpen] = useState(true)
  const cfg = BLOCK_CONFIG['tool-use']

  return (
    <div className={cn('rounded-lg overflow-hidden', cfg.accentBorder, cfg.accentBg)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Icon path={cfg.icon} className={cfg.iconColor} />
        <span className={cn('text-xs font-semibold', cfg.labelColor)}>{cfg.label}</span>
        <code className="text-xs font-mono bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded ml-1">
          {block.label}
        </code>
        <ChevronIcon open={open} className="ml-auto" />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <pre className="text-xs font-mono text-foreground/75 whitespace-pre-wrap break-words leading-relaxed bg-background/60 dark:bg-black/20 rounded p-2">
            {block.content}
          </pre>
        </div>
      )}
    </div>
  )
}
