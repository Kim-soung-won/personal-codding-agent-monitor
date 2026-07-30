import { cn } from '@/shared/lib/utils'
import type { EventOrigin } from '@/entities/session/model/events'

interface Props {
  origin: EventOrigin | undefined
  agentId?: string
  className?: string
}

/**
 * 서브에이전트 이벤트임을 표시한다.
 * 메인 세션 이벤트에는 아무것도 렌더링하지 않는다 (기본값이라 노이즈가 된다).
 */
export function OriginBadge({ origin, agentId, className }: Props) {
  if (origin !== 'subagent') return null

  return (
    <span
      className={cn(
        'text-xs px-1.5 py-0.5 rounded shrink-0',
        'bg-violet-500/15 text-violet-500 border border-violet-500/30',
        className,
      )}
      title={agentId ? `subagent: ${agentId}` : 'subagent'}
    >
      ⑂ {agentId ? agentId.replace(/^agent-/, '').slice(0, 6) : 'sub'}
    </span>
  )
}
