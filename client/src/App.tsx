import { Routes, Route, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/shared/lib/useTheme'
import { AppShell } from '@/shared/ui/AppShell'
import { useWebSocket, sessionQueries } from '@/entities/session'
import { CommitRecordsPage } from '@/pages/commit-records'
import { CommitRecordDetailPage } from '@/pages/commit-record-detail'
import { SubAgentsPage } from '@/pages/subagents'
import { PluginsPage } from '@/pages/plugins'
import { SkillsPage } from '@/pages/skills'
import { HomePage } from '@/pages/home'
import { ProjectsListPage } from '@/pages/projects-list'
import { ComparePage } from '@/pages/compare'
import { AnalyticsPage } from '@/pages/analytics'
import { SessionPage } from '@/pages/session'
import { ProjectPage } from '@/pages/project'

export default function App() {
  useTheme()
  const { data: sessions = [] } = useQuery(sessionQueries.list())
  // 전역 WS 연결 상태(빈 세션 구독 = 연결 표시용). 셸의 연결 점에 반영.
  const { connected } = useWebSocket([])

  return (
    <AppShell connected={connected}>
      <Routes>
        {/* 커밋 단위 기록 — 이 제품의 본체 */}
        <Route path="/" element={<CommitRecordsPage />} />
        <Route path="/records/:id" element={<CommitRecordDetailPage />} />
        <Route path="/subagents" element={<SubAgentsPage />} />
        <Route path="/plugins" element={<PluginsPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        {/* 참고자료(구 홈) */}
        <Route path="/reference/pricing" element={<HomePage />} />
        {/* 레거시 뷰(Phase 2b-2에서 대시보드로 대체 예정, 현재 URL로 접근 가능) */}
        <Route path="/projects" element={<ProjectsListPage sessions={sessions} />} />
        <Route path="/compare" element={<ComparePage sessions={sessions} />} />
        <Route path="/analytics" element={<AnalyticsPage sessions={sessions} />} />
        <Route path="/s/:sessionId" element={<Navigate to="chat" replace />} />
        <Route path="/s/:sessionId/:tab" element={<SessionPage sessions={sessions} onConnectedChange={() => {}} />} />
        <Route path="/p/:projectEncoded" element={<Navigate to="resources" replace />} />
        <Route path="/p/:projectEncoded/:tab" element={<ProjectPage sessions={sessions} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
