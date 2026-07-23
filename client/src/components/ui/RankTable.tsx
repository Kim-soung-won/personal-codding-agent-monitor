import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface Column<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  /** 셀 렌더러. 없으면 row[key] 를 그대로 표시 */
  render?: (row: T) => ReactNode
  className?: string
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  keyOf: (row: T) => string
  /** 주어지면 각 행에 미니 빈도 막대를 렌더 */
  barValueOf?: (row: T) => number
  maxBarValue?: number
  emptyMessage?: string
  onRowClick?: (row: T) => void
}

/** 분석 대시보드용 밀도 높은 랭킹 테이블(줄무늬 + 선택적 빈도 막대). */
export function RankTable<T>({
  columns,
  rows,
  keyOf,
  barValueOf,
  maxBarValue,
  emptyMessage = '데이터 없음',
  onRowClick,
}: Props<T>) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-8">{emptyMessage}</p>
  }
  const max = maxBarValue ?? (barValueOf ? Math.max(...rows.map(barValueOf), 1) : 1)

  return (
    <div className="overflow-x-auto rounded-lg border border-border-subtle">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-table-header">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground',
                  c.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={keyOf(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-t border-border-subtle',
                i % 2 === 1 && 'bg-table-stripe',
                onRowClick && 'cursor-pointer hover:bg-muted/40 transition-colors',
              )}
            >
              {columns.map((c, ci) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-3 py-1.5 tabular-nums align-middle',
                    c.align === 'right' ? 'text-right' : 'text-left',
                    c.className,
                  )}
                >
                  {/* 첫 컬럼 아래에 빈도 막대 */}
                  {ci === 0 && barValueOf ? (
                    <div className="flex flex-col gap-0.5">
                      <span>{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}</span>
                      <div className="h-1 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary/50"
                          style={{ width: `${(barValueOf(row) / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ) : c.render ? (
                    c.render(row)
                  ) : (
                    String((row as Record<string, unknown>)[c.key] ?? '')
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
