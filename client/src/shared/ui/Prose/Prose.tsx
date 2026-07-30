import { Fragment, type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

/**
 * LLM 이 쓴 마크다운 본문을 읽기 좋게 렌더한다.
 *
 * 무거운 마크다운 파서 의존성 대신, 상세 화면에 실제로 등장하는 문법만 처리한다:
 * 문단(빈 줄 구분) · 불릿 리스트(-, *) · **굵게**. 그 외는 원문 그대로 둔다.
 * whitespace-pre-wrap 이 LLM 의 하드 개행을 문장 중간에서 끊던 문제를 이걸로 대체한다.
 */

/** `**굵게**` 구간만 <strong> 으로 바꾸고 나머지는 텍스트로 둔다. */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

interface Props {
  children: string
  className?: string
}

/** 읽기용 본문 렌더 — 상세 화면의 요약·피드백·비용 메모에 쓴다. */
export function Prose({ children, className }: Props): ReactNode {
  // 빈 줄로 블록을 나눈다. 블록 안에서 모든 줄이 불릿이면 리스트로, 아니면 문단으로.
  const blocks = children
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)

  return (
    <div
      className={cn(
        'text-sm leading-relaxed text-foreground/90 space-y-3',
        className,
      )}
    >
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        const isList = lines.every((l) => /^[-*]\s+/.test(l.trim()))
        if (isList) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {lines.map((l, j) => (
                <li key={j}>{renderInline(l.trim().replace(/^[-*]\s+/, ''))}</li>
              ))}
            </ul>
          )
        }
        // 문단 안의 단일 개행은 공백으로 이어 붙여 문장이 중간에 끊기지 않게 한다.
        return <p key={i}>{renderInline(lines.join(' '))}</p>
      })}
    </div>
  )
}
