import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { PageShell } from '@/shared/ui/PageShell'
import { commitRecordQueries, InvocationHistory } from '@/entities/commit-record'

/** 한 플러그인의 개별 호출 이력 — 소속 에이전트·스킬·MCP 호출이 어느 커밋에서 났는지. */
export function PluginDetailPage() {
  const { plugin = '' } = useParams<{ plugin: string }>()
  const { data: rows = [], isPending } = useQuery(
    commitRecordQueries.invocations({ plugin }),
  )
  const errorCount = rows.filter((r) => r.isError).length

  return (
    <PageShell
      title={plugin}
      subtitle={`플러그인 호출 이력 · ${rows.length}회${errorCount > 0 ? ` · 오류 ${errorCount}` : ''}`}
    >
      <div className="mb-4">
        <Link to="/plugins" className="text-xs text-primary hover:underline">
          ← Plugins
        </Link>
      </div>
      {/* 플러그인 축은 자원명(에이전트/스킬)이 섞이므로 kind·plugin 을 함께 보인다. */}
      <InvocationHistory rows={rows} loading={isPending} showKind />
    </PageShell>
  )
}
