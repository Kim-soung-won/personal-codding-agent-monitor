import { useCallback, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface Props {
  /** 툴팁 본문 — 지표가 무엇을 뜻하고 왜 보는지 사용자 관점 설명. */
  children: ReactNode
  className?: string
  /**
   * 툴팁이 트리거의 위/아래 중 어디로 열릴지. 기본은 'top'.
   * 헤더 바로 아래처럼 위쪽 공간이 잘리는 위치에서는 'bottom' 을 준다.
   */
  placement?: 'top' | 'bottom'
}

// 툴팁 폭(px). w-56(14rem) 과 맞춘다. 클램프 계산에 실제 px 가 필요해 상수로 둔다.
const TOOLTIP_WIDTH = 224
// 뷰포트 가장자리에서 최소로 띄우는 여백(px).
const VIEWPORT_MARGIN = 8

interface Coords {
  left: number
  top: number
  placement: 'top' | 'bottom'
}

/**
 * ⓘ 트리거에 마우스를 올리거나 키보드 포커스하면 뜨는 경량 설명 툴팁.
 *
 * 툴팁은 `body` 로 portal 해 `fixed` 로 띄운다 — 스크롤 컨테이너(overflow)나
 * 사이드바 같은 조상 요소에 잘리지 않게 하려는 것이다. 가로 위치는 뷰포트 안으로
 * 클램프해 왼쪽 사이드바/오른쪽 경계 밖으로 넘치지 않는다.
 */
export function InfoHint({ children, className, placement = 'top' }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [coords, setCoords] = useState<Coords | null>(null)

  const show = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    // 트리거 중심을 기준으로 폭의 절반만큼 좌측 이동 후, 뷰포트 안으로 클램프.
    const centered = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(centered, vw - TOOLTIP_WIDTH - VIEWPORT_MARGIN),
    )
    // 위 공간이 부족하면 아래로 뒤집는다(요청 placement 는 선호값).
    const wantsTop = placement === 'top'
    const hasRoomAbove = rect.top > 120
    const finalPlacement: 'top' | 'bottom' =
      wantsTop && hasRoomAbove ? 'top' : 'bottom'
    const top = finalPlacement === 'top' ? rect.top - 6 : rect.bottom + 6
    setCoords({ left, top, placement: finalPlacement })
  }, [placement])

  const hide = useCallback(() => setCoords(null), [])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="지표 설명"
        className="cursor-help leading-none text-muted-foreground/70 hover:text-foreground focus:outline-none focus-visible:text-foreground"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        ⓘ
      </button>
      {coords &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: 'fixed',
              left: coords.left,
              top: coords.top,
              width: TOOLTIP_WIDTH,
              transform:
                coords.placement === 'top' ? 'translateY(-100%)' : undefined,
            }}
            className={cn(
              'pointer-events-none z-[100]',
              'rounded-lg border border-border bg-popover px-3 py-2 shadow-lg',
              'text-2xs font-normal normal-case leading-relaxed tracking-normal text-popover-foreground',
              className,
            )}
          >
            {children}
          </span>,
          document.body,
        )}
    </>
  )
}
