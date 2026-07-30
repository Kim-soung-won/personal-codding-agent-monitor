import { useMemo, useRef, useEffect } from 'react'
import { groupChatTurns } from '@/entities/session/model/groupChatTurns'
import type { NormalizedEvent } from '@/entities/session/model/events'
import { UserBubble } from '@/entities/session/ui/ChatView/components/UserBubble'
import { AgentTurn } from '@/entities/session/ui/ChatView/components/AgentTurn'

interface Props {
  events: NormalizedEvent[]
}

/** 세션 이벤트를 턴 단위 대화로 렌더한다. 하단 근처면 새 턴에 자동 스크롤. */
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
