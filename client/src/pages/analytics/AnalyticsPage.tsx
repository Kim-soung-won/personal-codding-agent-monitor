import { GlobalAnalytics } from '@/pages/analytics/ui/GlobalAnalytics'
import { DarkToggle } from '@/shared/ui/DarkToggle'
import type { SessionInfo } from '@/entities/session'

export function AnalyticsPage({ sessions }: { sessions: SessionInfo[] }) {
  return (
    <>
      <header className="shrink-0 flex items-center gap-3 px-4 border-b h-12">
        <p className="flex-1 text-sm font-medium">전체 Analytics</p>
        <DarkToggle />
      </header>
      <main className="flex-1 overflow-y-auto p-4">
        <GlobalAnalytics sessions={sessions} />
      </main>
    </>
  )
}
