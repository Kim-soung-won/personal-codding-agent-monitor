/**
 * ~/.claude/projects 의 세션 jsonl 을 클라우드로 additive 업로드한다.
 *
 * 로컬 상태 파일(sync-state.json)의 mtime 과 비교해 신규·변경 파일만 올린다.
 * 로컬에서 사라진 파일에 대해서는 어떤 요청도 보내지 않는다(삭제 미러링 금지 — 약점 #2 대응).
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { selectChangedFiles, updateState, type FileEntry } from './core.js'
import { loadEnv, putText } from './http.js'
import { getGitIdentity } from './git-identity.js'
import { readState, writeState } from './state.js'

const PROJECTS_DIR = join(homedir(), '.claude', 'projects')
const STATE_FILE = 'sync-state.json'

interface SessionFile extends FileEntry {
  kind: 'main' | 'subagent'
  encoded: string
  sessionId: string
  agentFile?: string
}

/** ~/.claude/projects 를 훑어 업로드 대상 jsonl 을 모두 수집한다. */
async function collectFiles(): Promise<SessionFile[]> {
  const out: SessionFile[] = []

  let encodedDirs: string[] = []
  try {
    encodedDirs = await readdir(PROJECTS_DIR)
  } catch {
    return out
  }

  for (const encoded of encodedDirs) {
    const projectDir = join(PROJECTS_DIR, encoded)
    let entries: string[]
    try {
      const s = await stat(projectDir)
      if (!s.isDirectory()) continue
      entries = await readdir(projectDir)
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryPath = join(projectDir, entry)
      if (entry.endsWith('.jsonl')) {
        try {
          const s = await stat(entryPath)
          out.push({
            path: entryPath,
            mtimeMs: s.mtimeMs,
            kind: 'main',
            encoded,
            sessionId: entry.replace('.jsonl', ''),
          })
        } catch {
          // skip
        }
        continue
      }

      // {sessionId}/subagents/*.jsonl
      const subagentDir = join(entryPath, 'subagents')
      try {
        const agentFiles = await readdir(subagentDir)
        for (const agentFile of agentFiles) {
          if (!agentFile.endsWith('.jsonl')) continue
          const agentPath = join(subagentDir, agentFile)
          try {
            const s = await stat(agentPath)
            out.push({
              path: agentPath,
              mtimeMs: s.mtimeMs,
              kind: 'subagent',
              encoded,
              sessionId: entry,
              agentFile,
            })
          } catch {
            // skip
          }
        }
      } catch {
        // subagents 디렉토리 없음 — 정상
      }
    }
  }

  return out
}

async function main(): Promise<void> {
  const env = await loadEnv()
  const state = await readState(STATE_FILE)

  const all = await collectFiles()
  const changed = selectChangedFiles(all, state) as SessionFile[]

  if (changed.length === 0) {
    console.log('[upload] 변경된 세션 없음')
    return
  }

  // 세션이 어느 유저 것인지 서버가 귀속하도록 git 신원을 1회 조회해 헤더로 전달
  const identity = await getGitIdentity()

  let uploaded = 0
  const succeeded: SessionFile[] = []
  for (const f of changed) {
    try {
      const body = await readFile(f.path, 'utf8')
      const path =
        f.kind === 'main'
          ? `/api/sync/session/${encodeURIComponent(f.encoded)}/${encodeURIComponent(f.sessionId)}`
          : `/api/sync/subagent/${encodeURIComponent(f.encoded)}/${encodeURIComponent(f.sessionId)}/${encodeURIComponent(f.agentFile!)}`
      await putText(env, path, body, identity)
      succeeded.push(f)
      uploaded++
    } catch (err) {
      // 실패한 파일은 상태를 갱신하지 않아 다음 실행에서 재시도된다
      console.error(`[upload] ${f.path} 실패:`, err)
    }
  }

  // 성공한 파일만 상태에 반영 — 실패분은 재시도 대상으로 남긴다
  await writeState(STATE_FILE, updateState(state, succeeded))
  console.log(`[upload] ${uploaded}/${changed.length}개 파일 업로드 완료`)
}

main().catch((err) => {
  console.error('[upload] 실패:', err)
  process.exit(1)
})
