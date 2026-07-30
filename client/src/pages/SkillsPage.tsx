import { useEffect, useMemo, useState } from 'react'
import { PageShell } from '@/shared/ui/PageShell'
import { StatCard } from '@/shared/ui/StatCard'
import { RankTable, type Column } from '@/shared/ui/RankTable'
import * as api from '@/lib/agentFactoryApi'
import type { SkillStatRow } from '@/types/agentFactory'

export function SkillsPage() {
  const [rows, setRows] = useState<SkillStatRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api
      .getSkillStats()
      .then(setRows)
      .finally(() => setLoading(false))
  }, [])

  const derived = useMemo(() => {
    const invocations = rows.reduce((s, r) => s + r.invocations, 0)
    const errors = rows.reduce((s, r) => s + r.errors, 0)
    const commits = rows.reduce((s, r) => s + r.commits, 0)
    return { invocations, errors, commits }
  }, [rows])

  const columns: Column<SkillStatRow>[] = [
    {
      key: 'skill',
      label: '스킬',
      render: (r) => <span className="font-medium font-mono text-xs">{r.skill}</span>,
    },
    {
      key: 'plugin',
      label: '플러그인',
      render: (r) => (
        <span className="font-mono text-2xs text-muted-foreground">{r.plugin ?? '—'}</span>
      ),
    },
    { key: 'invocations', label: '호출', align: 'right', render: (r) => r.invocations },
    { key: 'commits', label: '커밋', align: 'right', render: (r) => r.commits },
    {
      key: 'errors',
      label: '에러',
      align: 'right',
      render: (r) =>
        r.errors > 0 ? (
          <span className="text-destructive font-semibold">{r.errors}</span>
        ) : (
          <span className="text-muted-foreground/40">0</span>
        ),
    },
  ]

  return (
    <PageShell title="Skills" subtitle="스킬별 호출 빈도 집계 (커밋 누적)">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="스킬" value={loading ? '…' : rows.length} sub="사용된 종류" />
        <StatCard label="총 호출" value={loading ? '…' : derived.invocations} sub="누적 호출" />
        <StatCard label="등장 커밋" value={loading ? '…' : derived.commits} sub="스킬×커밋 쌍" />
        <StatCard
          label="총 에러"
          value={loading ? '…' : derived.errors}
          sub="스킬 실행 중 에러"
          tone={derived.errors > 0 ? 'bad' : 'good'}
        />
      </div>

      {!loading && rows.length === 0 && (
        <p className="text-2xs text-muted-foreground mb-3">
          스킬 사용 기록이 없습니다 — 스킬 호출을 이름과 함께 적는 규격(agent-factory 0.12.6+)으로
          distill 된 커밋부터 채워집니다.
        </p>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <RankTable
          columns={columns}
          rows={rows}
          keyOf={(r) => r.skill}
          barValueOf={(r) => r.invocations}
          emptyMessage={loading ? '불러오는 중…' : '스킬 사용 기록이 없습니다.'}
        />
      </div>
    </PageShell>
  )
}
