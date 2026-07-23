/**
 * 로컬 동기화 잡의 순수 로직(파일시스템·네트워크 I/O 없음).
 *
 * 여기 함수들은 부수효과가 없어 단위 테스트가 쉽다. I/O 는 http.ts 와 각 스크립트가 담당한다.
 */

import type { NormalizedEvent } from '../server/src/types.js'

/** mtime 기록 상태. filePath 또는 sessionId → 마지막으로 처리한 mtimeMs. */
export type SyncState = Record<string, number>

export interface FileEntry {
  /** 절대 경로 (state 키로도 사용) */
  path: string
  mtimeMs: number
}

/**
 * 상태 파일 기준으로 신규·변경된 파일만 고른다.
 * 로컬에서 사라진 파일은 애초에 입력 목록에 없으므로 삭제가 전파되지 않는다(additive-only).
 */
export function selectChangedFiles(files: FileEntry[], state: SyncState): FileEntry[] {
  return files.filter((f) => {
    const prev = state[f.path]
    return prev === undefined || f.mtimeMs > prev
  })
}

/** 처리한 파일들의 mtime 을 상태에 병합한다(기존 키는 유지, additive). */
export function updateState(state: SyncState, files: FileEntry[]): SyncState {
  const next: SyncState = { ...state }
  for (const f of files) {
    next[f.path] = f.mtimeMs
  }
  return next
}

/**
 * manifest 를 additive 로 병합한다. next 가 기존 키를 덮어쓰되,
 * prev 에만 있던 항목은 절대 삭제하지 않는다(클라우드 누적 보존 원칙).
 */
export function mergeManifest(
  prev: Record<string, string>,
  next: Record<string, string>,
): Record<string, string> {
  return { ...prev, ...next }
}

/** 간단한 .env 파서. KEY=VALUE 라인만 처리하고 주석(#)과 빈 줄은 무시한다. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    // 양쪽 따옴표 제거
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) out[key] = value
  }
  return out
}

const MAX_TRANSCRIPT_CHARS = 12000

/**
 * 정규화된 이벤트 배열을 요약 프롬프트용 텍스트로 압축한다.
 *
 * 사용자 입력·assistant 요약·tool 호출을 시간순으로 나열하되, 앞뒤를 살려
 * 전체 길이를 상한으로 자른다(가운데를 생략해 세션의 시작과 끝 맥락을 모두 남긴다).
 */
export function buildTranscript(events: NormalizedEvent[]): string {
  const lines: string[] = []
  for (const ev of events) {
    const text = ev.summary?.trim()
    if (!text) continue
    const speaker =
      ev.category === 'user-input'
        ? '사용자'
        : ev.category === 'tool-use'
          ? '도구'
          : ev.category === 'thinking'
            ? '사고'
            : ev.category === 'assistant-text'
              ? '응답'
              : null
    if (!speaker) continue
    lines.push(`[${speaker}] ${text}`)
  }

  const full = lines.join('\n')
  if (full.length <= MAX_TRANSCRIPT_CHARS) return full

  const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2)
  return `${full.slice(0, half)}\n…(중략)…\n${full.slice(-half)}`
}

/** Claude 응답 텍스트에서 title/description JSON 을 파싱한다. 실패 시 null. */
export function parseSummaryResponse(
  text: string,
): { title: string; description: string } | null {
  // 응답이 코드펜스로 감싸여 오는 경우를 대비해 첫 { … 마지막 } 구간을 추출
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    if (typeof parsed.title === 'string' && typeof parsed.description === 'string') {
      return { title: parsed.title.trim(), description: parsed.description.trim() }
    }
  } catch {
    // 파싱 실패
  }
  return null
}
