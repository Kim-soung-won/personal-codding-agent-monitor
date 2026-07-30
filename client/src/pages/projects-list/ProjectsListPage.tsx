import { useNavigate } from 'react-router-dom'
import { projectLabel, formatSessionTime, type SessionInfo } from '@/entities/session'
import { DarkToggle } from '@/shared/ui/DarkToggle'

interface ProjectGroup {
  projectEncoded: string
  projectPath: string
  sessionCount: number
  lastModified: number
}

function groupProjects(sessions: SessionInfo[]): ProjectGroup[] {
  const groups = new Map<string, SessionInfo[]>()
  for (const s of sessions) {
    const list = groups.get(s.projectEncoded)
    if (list) {
      list.push(s)
    } else {
      groups.set(s.projectEncoded, [s])
    }
  }
  return [...groups.entries()]
    .map(([projectEncoded, list]) => ({
      projectEncoded,
      projectPath: list[0]?.projectPath ?? '',
      sessionCount: list.length,
      lastModified: Math.max(...list.map(s => s.lastModified)),
    }))
    .sort((a, b) => b.lastModified - a.lastModified)
}

export function ProjectsListPage({ sessions }: { sessions: SessionInfo[] }) {
  const navigate = useNavigate()
  const projects = groupProjects(sessions)

  return (
    <>
      <header className="shrink-0 flex items-center gap-3 px-4 border-b h-12">
        <p className="flex-1 text-sm font-medium">프로젝트</p>
        <DarkToggle />
      </header>
      <main className="flex-1 overflow-y-auto p-4">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            프로젝트가 없습니다 — 로컬 파일 모드에서만 표시됩니다.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map(p => (
              <button
                key={p.projectEncoded}
                onClick={() => navigate(`/p/${encodeURIComponent(p.projectEncoded)}`)}
                className="text-left border rounded-md p-3 transition-colors hover:bg-muted/40 hover:border-primary/40"
              >
                <p className="text-sm font-medium truncate">{projectLabel(p.projectPath)}</p>
                <p className="text-xs text-muted-foreground mt-1">{p.sessionCount}개 세션</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {formatSessionTime(p.lastModified)}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
