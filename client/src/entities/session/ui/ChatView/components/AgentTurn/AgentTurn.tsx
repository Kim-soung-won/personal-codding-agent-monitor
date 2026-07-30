import type { ChatTurn } from '@/entities/session/model/groupChatTurns'
import { UsageLine } from '@/entities/session/ui/ChatView/components/UsageLine'
import { BlockRenderer } from '@/entities/session/ui/ChatView/components/BlockRenderer'

export function AgentTurn({ turn }: { turn: ChatTurn }) {
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
