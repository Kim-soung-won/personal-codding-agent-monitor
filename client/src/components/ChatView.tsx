import { useMemo, useRef, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { groupChatTurns } from '@/lib/groupChatTurns'
import type { AssistantBlock, AssistantBlockCategory, ChatTurn, TurnUsage } from '@/lib/groupChatTurns'
import type { NormalizedEvent } from '@/types/events'

interface Props {
  events: NormalizedEvent[]
}

// ─── Block config ─────────────────────────────────────────────────────────────

interface BlockConfig {
  accentBorder: string
  accentBg: string
  iconColor: string
  labelColor: string
  icon: string
  label: string
  defaultOpen: boolean
}

const BLOCK_CONFIG: Record<AssistantBlockCategory, BlockConfig> = {
  thinking: {
    accentBorder: 'border-l-[3px] border-violet-500',
    accentBg:     'bg-violet-500/5 dark:bg-violet-500/8',
    iconColor:    'text-violet-500',
    labelColor:   'text-violet-600 dark:text-violet-400',
    icon: 'M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26A7 7 0 0 1 12 2z', // brain-ish
    label: 'Thinking',
    defaultOpen: false,
  },
  'tool-use': {
    accentBorder: 'border-l-[3px] border-amber-500',
    accentBg:     'bg-amber-500/5 dark:bg-amber-500/8',
    iconColor:    'text-amber-500',
    labelColor:   'text-amber-600 dark:text-amber-400',
    icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z', // tool
    label: 'Function Call',
    defaultOpen: true,
  },
  'tool-result-ok': {
    accentBorder: 'border-l-[3px] border-emerald-500',
    accentBg:     'bg-emerald-500/5 dark:bg-emerald-500/8',
    iconColor:    'text-emerald-500',
    labelColor:   'text-emerald-600 dark:text-emerald-400',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', // check-circle
    label: 'Function Response',
    defaultOpen: false,
  },
  'tool-result-error': {
    accentBorder: 'border-l-[3px] border-rose-500',
    accentBg:     'bg-rose-500/5 dark:bg-rose-500/8',
    iconColor:    'text-rose-500',
    labelColor:   'text-rose-600 dark:text-rose-400',
    icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', // x-circle
    label: 'Function Error',
    defaultOpen: true,
  },
  'assistant-text': {
    accentBorder: '',
    accentBg:     '',
    iconColor:    'text-blue-500',
    labelColor:   'text-muted-foreground',
    icon: '', // no icon for text blocks
    label: '',
    defaultOpen: true,
  },
}

// ─── SVG icon helper ──────────────────────────────────────────────────────────

function Icon({ path, className }: { path: string; className?: string }) {
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

// ─── Individual block renderers ───────────────────────────────────────────────

function ThinkingBlock({ block }: { block: AssistantBlock }) {
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

function ToolUseBlock({ block }: { block: AssistantBlock }) {
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

function ToolResultBlock({ block }: { block: AssistantBlock }) {
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

function TextBlock({ block }: { block: AssistantBlock }) {
  return (
    <div className="px-1 py-0.5">
      <pre className="text-sm text-foreground whitespace-pre-wrap break-words leading-[1.7]">
        {block.content}
      </pre>
    </div>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function UsageLine({ usage }: { usage: TurnUsage }) {
  const hasData = usage.outputTokens > 0 || usage.cacheRead > 0 || usage.estimatedCostUsd > 0
  if (!hasData) return null

  const costStr = usage.estimatedCostUsd < 0.00005
    ? '<$0.01'
    : `$${usage.estimatedCostUsd.toFixed(4)}`

  return (
    <div className="flex items-center gap-2 flex-wrap mt-1">
      {/* Cost chip */}
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-mono font-medium">
        {costStr}
      </span>
      {/* Token chips */}
      {usage.outputTokens > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          {fmt(usage.outputTokens)} out
        </span>
      )}
      {usage.cacheRead > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z" />
            <path strokeLinecap="round" d="M9 11h6m-6 4h4" />
          </svg>
          {fmt(usage.cacheRead)} cached
        </span>
      )}
      {usage.cacheWrite > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground opacity-70">
          {fmt(usage.cacheWrite)} wrote
        </span>
      )}
    </div>
  )
}

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 shrink-0', open && 'rotate-180', className)}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function BlockRenderer({ block }: { block: AssistantBlock }) {
  switch (block.category) {
    case 'thinking':         return <ThinkingBlock block={block} />
    case 'tool-use':         return <ToolUseBlock block={block} />
    case 'tool-result-ok':   return <ToolResultBlock block={block} />
    case 'tool-result-error':return <ToolResultBlock block={block} />
    case 'assistant-text':   return <TextBlock block={block} />
  }
}

// ─── Turn components ──────────────────────────────────────────────────────────

function UserBubble({ turn }: { turn: ChatTurn }) {
  const msg = turn.userMessage!
  const time = new Date(turn.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit',
  })

  if (msg.kind === 'injected') {
    return (
      <div className="flex justify-center my-1">
        <div className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-full px-3 py-1">
          <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span className="text-[11px] text-muted-foreground truncate max-w-[280px]">
            {msg.text.slice(0, 80)}{msg.text.length > 80 ? '…' : ''}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{time}</span>
        <span className="font-medium text-foreground/70">You</span>
      </div>
      <div className="max-w-[72%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
        <pre className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.text}</pre>
      </div>
    </div>
  )
}

function AgentTurn({ turn }: { turn: ChatTurn }) {
  const time = new Date(turn.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit',
  })
  const isEmpty = turn.assistantBlocks.length === 0

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex w-4 h-4 rounded-full bg-primary/20 items-center justify-center">
            <span className="text-[8px] font-bold text-primary">A</span>
          </span>
          <span className="font-medium text-foreground/70">Agent</span>
          <span>{time}</span>
        </div>
        <UsageLine usage={turn.usage} />
      </div>
      <div className="w-full max-w-[88%]">
        {isEmpty ? (
          <p className="text-sm text-muted-foreground italic px-1">응답 대기 중…</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {turn.assistantBlocks.map((block) => (
              <BlockRenderer key={block.id} block={block} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatView({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const turns = useMemo(() => groupChatTurns(events), [events])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    if (isNearBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns.length])

  if (turns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2">
        <p className="text-sm text-muted-foreground">대화 내용이 없습니다.</p>
        <p className="text-xs text-muted-foreground opacity-60">이 세션에는 아직 이벤트가 없습니다.</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-6 max-w-3xl mx-auto pb-8"
    >
      {turns.map((turn) => (
        <div key={turn.id} className="flex flex-col gap-2">
          {turn.userMessage && <UserBubble turn={turn} />}
          {(turn.assistantBlocks.length > 0 || !turn.userMessage) && (
            <AgentTurn turn={turn} />
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
