import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface Props {
  /** 툴팁 본문 — 지표가 무엇을 뜻하고 왜 보는지 사용자 관점 설명. */
  children: ReactNode
  className?: string
}

/**
 * ⓘ 트리거에 마우스를 올리거나 키보드 포커스하면 즉시 뜨는 경량 설명 툴팁.
 *
 * 네이티브 `title` 은 hover 지연이 길고 안 뜨는 환경이 있어 CSS hover 로 대체한다.
 * 외부 의존성 없이 group-hover/focus-within 으로만 동작한다.
 */
export function InfoHint({ children, className }: Props) {
  return (
    <span className="group/hint relative inline-flex align-middle">
      <button
        type="button"
        aria-label="지표 설명"
        className="cursor-help leading-none text-muted-foreground/70 hover:text-foreground focus:outline-none focus-visible:text-foreground"
      >
        ⓘ
      </button>
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-56 -translate-x-1/2',
          'rounded-lg border border-border bg-popover px-3 py-2 shadow-lg',
          'text-2xs font-normal normal-case leading-relaxed tracking-normal text-popover-foreground',
          'opacity-0 transition-opacity duration-100',
          'group-hover/hint:opacity-100 group-focus-within/hint:opacity-100',
          className,
        )}
      >
        {children}
      </span>
    </span>
  )
}
