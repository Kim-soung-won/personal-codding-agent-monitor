import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SessionInfo } from '../types.js'

const CLAUDE_PROJECTS = join(homedir(), '.claude', 'projects')

async function resolveSegments(base: string, parts: string[], idx: number): Promise<string> {
  if (idx >= parts.length) return base

  let entries: string[]
  try {
    entries = await readdir(base)
  } catch {
    return join(base, parts.slice(idx).join('-'))
  }

  const entrySet = new Set(entries)
  const remaining = parts.length - idx

  // 긴 매칭부터 시도 (최대 8 파트), 구분자는 -, _, . 순으로 시도
  for (let count = Math.min(remaining, 8); count >= 1; count--) {
    const chunk = parts.slice(idx, idx + count)
    const separators = count === 1 ? [''] : ['-', '_', '.']

    for (const sep of separators) {
      const candidate = chunk.join(sep)
      if (entrySet.has(candidate)) {
        return resolveSegments(join(base, candidate), parts, idx + count)
      }
    }
  }

  // 매칭 실패 시 단일 파트 그대로 사용하고 계속 탐색
  return resolveSegments(join(base, parts[idx]), parts, idx + 1)
}

export async function resolveProjectPath(encoded: string): Promise<string> {
  const parts = encoded.replace(/^-/, '').split('-').filter(Boolean)
  return resolveSegments('/', parts, 0)
}

export async function scanSessions(): Promise<SessionInfo[]> {
  const sessions: SessionInfo[] = []

  let projectDirs: string[]
  try {
    projectDirs = await readdir(CLAUDE_PROJECTS)
  } catch {
    return sessions
  }

  await Promise.all(
    projectDirs.map(async (encoded) => {
      const projectDir = join(CLAUDE_PROJECTS, encoded)
      try {
        const s = await stat(projectDir)
        if (!s.isDirectory()) return

        const [files, projectPath] = await Promise.all([
          readdir(projectDir),
          resolveProjectPath(encoded),
        ])

        await Promise.all(
          files
            .filter((f) => f.endsWith('.jsonl'))
            .map(async (file) => {
              const filePath = join(projectDir, file)
              let lastModified = 0
              try {
                const fs = await stat(filePath)
                lastModified = fs.mtimeMs
              } catch {
                // stat 실패 시 0으로 유지
              }
              sessions.push({
                projectPath,
                projectEncoded: encoded,
                sessionId: file.replace('.jsonl', ''),
                filePath,
                lastModified,
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
