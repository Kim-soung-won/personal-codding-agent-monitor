import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolveProjectPath } from '../../../shared/project-path.js'
import type { SessionInfo } from '../types.js'

// 경로 복원 로직은 shared/ 로 이동해 sync 잡과 공유한다. 기존 export 시그니처는 유지.
export { resolveProjectPath }

const DEFAULT_PROJECTS = join(homedir(), '.claude', 'projects')

/**
 * `${baseDir}/manifest.json` 을 읽어 encoded → 실제 projectPath 맵을 반환한다.
 *
 * 클라우드 환경에서는 실제 프로젝트 디렉토리가 없어 resolveProjectPath()의
 * 파일시스템 탐색이 실패하므로, sync 잡이 로컬에서 만든 이 manifest 를 우선 조회한다.
 * 파일 부재/파싱 실패 시 빈 객체를 반환한다(방어적 처리 — 로컬 dev 는 manifest 없이 동작).
 */
async function loadManifest(baseDir: string): Promise<Record<string, string>> {
  try {
    const text = await readFile(join(baseDir, 'manifest.json'), 'utf8')
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>
  } catch {
    // manifest 없음 또는 파싱 실패 — FS 탐색 폴백으로 진행
  }
  return {}
}

/**
 * `${projectDir}/${sessionId}.summary.json` 사이드카에서 제목·설명을 읽는다.
 *
 * 로컬 sync 잡(generate-summaries.ts)이 Claude API 로 생성해 업로드한 파일이다.
 * 스키마: `{ sessionId, title, description, generatedAt }`. 부재/파싱 실패 시 undefined.
 */
async function loadSummary(
  projectDir: string,
  sessionId: string,
): Promise<{ title?: string; description?: string }> {
  try {
    const text = await readFile(join(projectDir, `${sessionId}.summary.json`), 'utf8')
    const parsed = JSON.parse(text) as Record<string, unknown>
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
    }
  } catch {
    return {}
  }
}

/**
 * {projectDir}/{session-uuid}/subagents/*.jsonl 을 찾는다.
 *
 * 서브에이전트 파일은 프로젝트 디렉토리 최상위가 아니라 세션 UUID 이름의
 * 하위 디렉토리에 있어 최상위 readdir 로는 잡히지 않는다.
 */
async function findSubagentFiles(projectDir: string, sessionId: string): Promise<string[]> {
  const subagentDir = join(projectDir, sessionId, 'subagents')
  try {
    const entries = await readdir(subagentDir)
    return entries.filter((f) => f.endsWith('.jsonl')).map((f) => join(subagentDir, f))
  } catch {
    // 서브에이전트 디렉토리 없음 — 정상 케이스
    return []
  }
}

export async function scanSessions(baseDir?: string): Promise<SessionInfo[]> {
  const projectsDir = baseDir ?? DEFAULT_PROJECTS
  const sessions: SessionInfo[] = []

  let projectDirs: string[]
  try {
    projectDirs = await readdir(projectsDir)
  } catch {
    return sessions
  }

  const manifest = await loadManifest(projectsDir)

  await Promise.all(
    projectDirs.map(async (encoded) => {
      const projectDir = join(projectsDir, encoded)
      try {
        const s = await stat(projectDir)
        if (!s.isDirectory()) return

        // manifest 우선 조회 → 없으면 파일시스템 탐색 폴백
        const [files, projectPath] = await Promise.all([
          readdir(projectDir),
          manifest[encoded]
            ? Promise.resolve(manifest[encoded])
            : resolveProjectPath(encoded),
        ])

        await Promise.all(
          files
            .filter((f) => f.endsWith('.jsonl'))
            .map(async (file) => {
              const filePath = join(projectDir, file)
              const sessionId = file.replace('.jsonl', '')
              let lastModified = 0
              try {
                const fs = await stat(filePath)
                lastModified = fs.mtimeMs
              } catch {
                // stat 실패 시 0으로 유지
              }
              const [subagentFilePaths, summary] = await Promise.all([
                findSubagentFiles(projectDir, sessionId),
                loadSummary(projectDir, sessionId),
              ])
              sessions.push({
                projectPath,
                projectEncoded: encoded,
                sessionId,
                filePath,
                lastModified,
                subagentFilePaths,
                ...(summary.title ? { title: summary.title } : {}),
                ...(summary.description ? { description: summary.description } : {}),
              })
            }),
        )
      } catch {
        // 접근 불가 디렉토리 skip
      }
    }),
  )

  return sessions.sort((a, b) => b.lastModified - a.lastModified)
}
