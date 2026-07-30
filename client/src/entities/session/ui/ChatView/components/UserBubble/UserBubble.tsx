import type { ChatTurn } from '@/entities/session/model/groupChatTurns'

export function UserBubble({ turn }: { turn: ChatTurn }) {
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
