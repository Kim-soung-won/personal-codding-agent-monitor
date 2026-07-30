import type { AssistantBlock } from '@/entities/session/model/groupChatTurns'

export function TextBlock({ block }: { block: AssistantBlock }) {
  return (
    <div className="px-1 py-0.5">
      <pre className="text-sm text-foreground whitespace-pre-wrap break-words leading-[1.7]">
        {block.content}
      </pre>
    </div>
  )
}
