import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { PageShell } from '@/shared/ui/PageShell'
import { commitRecordQueries, InvocationHistory } from '@/entities/commit-record'

/** 한 스킬의 개별 호출 이력 — 어느 커밋에서 무엇을 위해 호출됐는지. */
export function SkillDetailPage() {
  const { skill = '' } = useParams<{ skill: string }>()
  const { data: rows = [], isPending } = useQuery(
    commitRecordQueries.invocations({ kind: 'SKILL', resource: skill }),
  )
  const errorCount = rows.filter((r) => r.isError).length

  return (
    <PageShell
      title={skill}
      subtitle={`스킬 호출 이력 · ${rows.length}회${errorCount > 0 ? ` · 오류 ${errorCount}` : ''}`}
    >
      <div className="mb-4">
        <Link to="/skills" className="text-xs text-primary hover:underline">
          ← Skills
        </Link>
      </div>
      <InvocationHistory rows={rows} loading={isPending} />
    </PageShell>
  )
}
