import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { PageShell } from '@/shared/ui/PageShell'
import { commitRecordQueries, InvocationHistory } from '@/entities/commit-record'

/** 한 서브에이전트의 개별 호출 이력 — 어느 커밋에서 무엇을 위해 spawn 됐는지. */
export function SubAgentDetailPage() {
  const { agent = '' } = useParams<{ agent: string }>()
  const { data: rows = [], isPending } = useQuery(
    commitRecordQueries.invocations({ kind: 'AGENT', resource: agent }),
  )
  const errorCount = rows.filter((r) => r.isError).length

  return (
    <PageShell
      title={agent}
      subtitle={`서브에이전트 호출 이력 · ${rows.length}회${errorCount > 0 ? ` · 오류 ${errorCount}` : ''}`}
    >
      <div className="mb-4">
        <Link to="/subagents" className="text-xs text-primary hover:underline">
          ← Sub-agents
        </Link>
      </div>
      <InvocationHistory rows={rows} loading={isPending} />
    </PageShell>
  )
}
