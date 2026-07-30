import { SessionCompare } from '@/features/session-compare'
import { DarkToggle } from '@/shared/ui/DarkToggle'
import type { SessionInfo } from '@/entities/session'

export function ComparePage({ sessions }: { sessions: SessionInfo[] }) {
  return (
    <>
      <header className="shrink-0 flex items-center gap-3 px-4 border-b h-12">
        <p className="flex-1 text-sm font-medium">세션 비교</p>
        <DarkToggle />
      </header>
      <main className="flex-1 overflow-y-auto p-4">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            비교할 세션이 없습니다 — 로컬 파일 모드에서만 표시됩니다.
          </p>
        ) : (
          <SessionCompare sessions={sessions} />
        )}
      </main>
    </>
  )
}
