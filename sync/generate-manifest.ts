/**
 * encoded → 실제 projectPath manifest 를 로컬 파일시스템 기준으로 생성해 업로드한다.
 *
 * 클라우드에는 실제 프로젝트 디렉토리가 없어 서버의 경로 복원이 실패하므로,
 * 로컬에서만 정확히 만들 수 있는 이 매핑을 미리 밀어 넣는다.
 * 로컬에서 사라진 프로젝트의 라벨도 유지하기 위해 로컬 캐시와 additive 병합한다.
 */

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolveProjectPath } from '../shared/project-path.js'
import { mergeManifest } from './core.js'
import { loadEnv, putJson } from './http.js'

const PROJECTS_DIR = join(homedir(), '.claude', 'projects')
const CACHE_PATH = join(homedir(), '.claude-observer', 'manifest.json')

async function readCache(): Promise<Record<string, string>> {
  try {
    const parsed = JSON.parse(await readFile(CACHE_PATH, 'utf8'))
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>
  } catch {
    // 캐시 없음
  }
  return {}
}

async function main(): Promise<void> {
  const env = await loadEnv()

  let encodedDirs: string[] = []
  try {
    encodedDirs = await readdir(PROJECTS_DIR)
  } catch {
    console.error(`[manifest] ${PROJECTS_DIR} 를 읽을 수 없습니다.`)
    process.exit(1)
  }

  const fresh: Record<string, string> = {}
  for (const encoded of encodedDirs) {
    try {
      const s = await stat(join(PROJECTS_DIR, encoded))
      if (!s.isDirectory()) continue
      fresh[encoded] = await resolveProjectPath(encoded)
    } catch {
      // skip
    }
  }

  const merged = mergeManifest(await readCache(), fresh)

  await mkdir(join(homedir(), '.claude-observer'), { recursive: true })
  await writeFile(CACHE_PATH, JSON.stringify(merged, null, 2), 'utf8')

  await putJson(env, '/api/sync/manifest', merged)
  console.log(`[manifest] ${Object.keys(merged).length}개 프로젝트 매핑 업로드 완료`)
}

main().catch((err) => {
  console.error('[manifest] 실패:', err)
  process.exit(1)
})
