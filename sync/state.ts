/**
 * 로컬 동기화 상태 파일 읽기/쓰기(~/.claude-observer/*.json).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SyncState } from './core.js'

const STATE_DIR = join(homedir(), '.claude-observer')

export async function readState(fileName: string): Promise<SyncState> {
  try {
    const text = await readFile(join(STATE_DIR, fileName), 'utf8')
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object') return parsed as SyncState
  } catch {
    // 상태 파일 없음 — 최초 실행
  }
  return {}
}

export async function writeState(fileName: string, state: SyncState): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true })
  await writeFile(join(STATE_DIR, fileName), JSON.stringify(state, null, 2), 'utf8')
}
