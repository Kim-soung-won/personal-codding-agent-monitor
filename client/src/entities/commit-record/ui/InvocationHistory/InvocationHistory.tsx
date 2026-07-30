import { Link } from 'react-router-dom'
import { cn } from '@/shared/lib/utils'
import type { InvocationHistoryRow } from '@/entities/commit-record/model/agentFactory'

interface Props {
  rows: InvocationHistoryRow[]
  loading: boolean
  /** 커밋 컬럼 옆에 plugin·kind 를 함께 보일지(플러그인 상세는 자원명이 축이라 켠다). */
  showKind?: boolean
}

/**
 * 개별 호출 이력 목록 — 축별 상세 페이지(서브에이전트·스킬·플러그인)가 공유한다.
 * 각 행: 대상(요지) + 주체 + 오류 + 그 호출이 나온 커밋(클릭 시 커밋 상세로).
 */
export function InvocationHistory({ rows, loading, showKind = false }: Props) {
  if (loading) {
    return <p className="text-sm text-muted-foreground py-12 text-center">불러오는 중…</p>
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        호출 이력이 없습니다 — 이 항목을 이름과 함께 기록한 커밋부터 채워집니다.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.id}
          className={cn(
            'rounded-lg border bg-card px-3 py-2.5',
            r.isError ? 'border-destructive/30' : 'border-border',
          )}
        >
          {/* 1줄: (kind·)자원명 + 주체 + 오류 뱃지 */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {showKind && r.kind && (
              <span className="text-2xs px-1.5 py-0.5 rounded font-semibold bg-primary/10 text-primary">
                {r.kind}
              </span>
            )}
            <span className="font-mono text-sm font-medium">{r.resource}</span>
            {r.plugin && showKind && (
              <span className="text-2xs font-mono text-muted-foreground">{r.plugin}</span>
            )}
            <span className="text-2xs text-muted-foreground">· {r.actor}</span>
            {r.isError && (
              <span className="text-2xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                오류
              </span>
            )}
          </div>

          {/* 2줄: 대상(요지) */}
          {r.target && (
            <p className="text-xs text-foreground/80 mb-1.5 leading-relaxed">{r.target}</p>
          )}

          {/* 3줄: 커밋 참조(클릭 → 커밋 상세) */}
          <Link
            to={`/records/${r.commitId}`}
            className="inline-flex items-center gap-2 text-2xs text-muted-foreground hover:text-primary"
          >
            <span className="font-mono">{r.commitSha.slice(0, 7)}</span>
            {r.commitSubject && <span className="truncate max-w-md">{r.commitSubject}</span>}
            <span className="text-muted-foreground/60">{r.capturedAt.slice(0, 10)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
