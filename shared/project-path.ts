/**
 * 인코딩된 프로젝트 디렉토리명(`-Users-foo-bar`)을 실제 파일시스템 경로로 복원한다.
 *
 * server/ 와 로컬 동기화 스크립트(sync/) 양쪽에서 import 한다.
 * Claude Code는 경로의 `/`와 `_`를 모두 `-`로 인코딩해 역방향 복원이 불가능하므로,
 * 실제 파일시스템을 걸어 내려가며 매칭한다.
 *
 * 주의: 이 함수는 로컬 머신(실제 프로젝트 디렉토리가 존재하는 환경)에서만 정확하다.
 * 클라우드 서버처럼 실제 경로가 없는 환경에서는 매칭이 실패해 라벨이 뭉개지므로,
 * sync 잡이 미리 생성한 manifest.json 을 우선 조회해야 한다.
 */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

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
