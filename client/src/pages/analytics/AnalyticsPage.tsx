import { GlobalAnalytics } from '@/pages/analytics/ui/GlobalAnalytics'
import { DarkToggle } from '@/shared/ui/DarkToggle'

/** 커밋 기록(DB) 기반 분석 화면. 로컬 JSONL 세션 목록에 의존하지 않는다. */
export function AnalyticsPage() {
  return (
    <>
      <header className="shrink-0 flex items-center gap-3 px-4 border-b h-12">
        <p className="flex-1 text-sm font-medium">전체 Analytics</p>
        <DarkToggle />
      </header>
      <main className="flex-1 overflow-y-auto p-4">
        <GlobalAnalytics />
      </main>
    </>
  )
}
