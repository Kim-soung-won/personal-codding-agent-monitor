interface Props {
  title?: string
  description?: string
}

/**
 * 로컬 sync 잡이 생성한 세션 제목·설명 메타데이터를 표시한다.
 *
 * 기존 SessionSummaryCard(이전 세션 hook 요약)와 데이터 소스가 다른 별개 기능이므로
 * 시각 패턴(rounded border, muted 배경)만 공유하고 컴포넌트는 분리한다.
 * title 이 없으면(사이드카 미생성) 아무것도 렌더링하지 않는다.
 */
export function SessionTitleBadge({ title, description }: Props) {
  if (!title) return null

  return (
    <div className="border rounded-lg bg-muted/30 px-3 py-2.5 mb-3">
      <p className="text-sm font-semibold leading-snug">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      )}
    </div>
  )
}
