import type { AssistantBlock } from '@/entities/session/model/groupChatTurns'
import { ThinkingBlock } from '@/entities/session/ui/ChatView/components/ThinkingBlock'
import { ToolUseBlock } from '@/entities/session/ui/ChatView/components/ToolUseBlock'
import { ToolResultBlock } from '@/entities/session/ui/ChatView/components/ToolResultBlock'
import { TextBlock } from '@/entities/session/ui/ChatView/components/TextBlock'

/** 블록 카테고리에 맞는 렌더러로 분기한다. */
export function BlockRenderer({ block }: { block: AssistantBlock }) {
  switch (block.category) {
    case 'thinking':          return <ThinkingBlock block={block} />
    case 'tool-use':          return <ToolUseBlock block={block} />
    case 'tool-result-ok':    return <ToolResultBlock block={block} />
    case 'tool-result-error': return <ToolResultBlock block={block} />
    case 'assistant-text':    return <TextBlock block={block} />
  }
}
