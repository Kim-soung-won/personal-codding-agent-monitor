import { useState } from 'react'
import { useSessionEventsForCompare } from '@/features/session-compare/api/useSessionEventsForCompare'
import { ThinkingViewer } from '@/entities/session'
import type { SessionInfo } from '@/entities/session'

interface Props {
  sessions: SessionInfo[]
}

function sessionLabel(s: SessionInfo): string {
  const date = new Date(s.lastModified).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${s.sessionId.slice(0, 8)} · ${date}`
}

function ComparePanel({ sessions, label }: { sessions: SessionInfo[]; label: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const { events, loading } = useSessionEventsForCompare(sessionId)

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground shrink-0">{label}</span>
        <select
          className="text-sm border rounded px-2 py-1 bg-background flex-1 min-w-0"
          value={sessionId ?? ''}
          onChange={(e) => setSessionId(e.target.value || null)}
        >
          <option value="">— 세션 선택 —</option>
          {sessions.map((s) => (
            <option key={s.sessionId} value={s.sessionId}>
              {sessionLabel(s)}
            </option>
          ))}
        </select>
        {loading && <span className="text-xs text-muted-foreground shrink-0">로딩…</span>}
      </div>
      {sessionId ? (
        <ThinkingViewer events={events} />
      ) : (
        <p className="text-sm text-muted-foreground py-12 text-center border rounded">
          세션을 선택하세요
        </p>
      )}
    </div>
  )
}

export function SessionCompare({ sessions }: Props) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        프로젝트를 먼저 선택하세요
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <ComparePanel sessions={sessions} label="좌" />
      <ComparePanel sessions={sessions} label="우" />
    </div>
  )
}
