import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { RESOURCE_KINDS, KIND_LABEL, type ResourceKind } from '@/shared/lib/resourceKind'

export interface SelectOption {
  value: number
  label: string
}

interface Props {
  dateFrom: string
  dateTo: string
  onDateChange: (from: string, to: string) => void
  projectOptions: SelectOption[]
  projectId: number | null
  onProjectChange: (id: number | null) => void
  userOptions: number[]
  userId: number | null
  onUserChange: (id: number | null) => void
  /** 리소스 종류 토글(선택). 지정 시 kind 칩 렌더 */
  kind?: ResourceKind | null
  onKindChange?: (kind: ResourceKind | null) => void
  rightSlot?: ReactNode
}

const SELECT_CLASS =
  'h-7 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary'

/** 대시보드 상단 고정 필터바 (날짜 범위 · 프로젝트 · 유저 · 리소스 종류). */
export function FilterBar({
  dateFrom,
  dateTo,
  onDateChange,
  projectOptions,
  projectId,
  onProjectChange,
  userOptions,
  userId,
  onUserChange,
  kind,
  onKindChange,
  rightSlot,
}: Props) {
  return (
    <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-4 py-2 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateChange(e.target.value, dateTo)}
          className={SELECT_CLASS}
        />
        <span className="text-xs text-muted-foreground">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateChange(dateFrom, e.target.value)}
          className={SELECT_CLASS}
        />
      </div>

      <select
        value={projectId ?? ''}
        onChange={(e) => onProjectChange(e.target.value ? Number(e.target.value) : null)}
        className={SELECT_CLASS}
      >
        <option value="">전체 프로젝트</option>
        {projectOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        value={userId ?? ''}
        onChange={(e) => onUserChange(e.target.value ? Number(e.target.value) : null)}
        className={SELECT_CLASS}
      >
        <option value="">전체 유저</option>
        {userOptions.map((u) => (
          <option key={u} value={u}>
            User #{u}
          </option>
        ))}
      </select>

      {onKindChange && (
        <div className="flex items-center gap-1">
          {RESOURCE_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => onKindChange(kind === k ? null : k)}
              className={cn(
                'text-2xs px-2 py-1 rounded-md border transition-colors',
                kind === k
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}

      {rightSlot && <div className="ml-auto flex items-center gap-2">{rightSlot}</div>}
    </div>
  )
}
