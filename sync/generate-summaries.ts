/**
 * 로컬 `claude` CLI(Claude Code, 구독 인증)로 세션별 제목·설명을 생성해
 * 사이드카(.summary.json)로 쓰고 클라우드로 업로드한다.
 *
 * API 키를 쓰지 않는다 — 사용자가 구독한 Claude 계정으로 로그인된 `claude` CLI 를
 * headless 모드(`claude -p`)로 호출한다. 따라서 이 스크립트는 로컬 머신에서만 동작한다.
 *
 * 주의: `claude -p` 호출은 그 자체로 ~/.claude/projects 에 세션을 남긴다.
 * 재귀 요약을 막기 위해 전용 디렉토리(SUMMARIZER_DIR)에서 실행하고,
 * 그 디렉토리에서 나온 세션은 요약 대상에서 제외한다.
 */

import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { scanSessions } from '../server/src/scanner/index.js'
import { JsonlEventParser } from '../server/src/parser/index.js'
import type { EventOrigin, NormalizedEvent, SessionInfo } from '../server/src/types.js'
import { buildTranscript, parseSummaryResponse, updateState } from './core.js'
import { loadEnv, putJson, type SyncEnv } from './http.js'
import { readState, writeState } from './state.js'

const STATE_FILE = 'summary-state.json'
// claude CLI 를 실행할 전용 작업 디렉토리(요약 대상에서 제외됨)
const SUMMARIZER_DIR = join(homedir(), '.claude-observer', 'summarizer')
const CLI_TIMEOUT_MS = 120_000

const parser = new JsonlEventParser()

const SYSTEM_PROMPT =
  '너는 개발자의 Claude Code 세션 로그를 읽고 한국어로 간결한 제목과 설명을 붙이는 요약가다. ' +
  '반드시 {"title": "...", "description": "..."} 형태의 JSON 만 출력한다. ' +
  'title 은 25자 이내의 명사구, description 은 이 세션에서 무슨 작업을 했는지 2~3문장으로 설명한다.'

/** 세션의 메인 + 서브에이전트 파일을 파싱해 이벤트 배열로 합친다(서버 로직과 동일). */
async function parseSessionEvents(session: SessionInfo): Promise<NormalizedEvent[]> {
  const sources: Array<{ path: string; origin: EventOrigin }> = [
    { path: session.filePath, origin: 'main' },
    ...session.subagentFilePaths.map((path) => ({ path, origin: 'subagent' as const })),
  ]
  const events: NormalizedEvent[] = []
  for (const { path, origin } of sources) {
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const ev = parser.parse(line, session.sessionId, origin)
      if (ev && ev.category !== 'unknown') events.push(ev)
    }
  }
  return events
}

/**
 * `claude -p` 를 headless 로 호출해 title/description 을 생성한다.
 * 구독 인증을 쓰므로 API 키가 필요 없다. 실패/타임아웃 시 null.
 */
function runClaudeSummary(
  env: SyncEnv,
  transcript: string,
): Promise<{ title: string; description: string } | null> {
  return new Promise((resolve) => {
    const args = [
      '-p',
      `다음 세션 로그를 요약해줘:\n\n${transcript}`,
      '--append-system-prompt',
      SYSTEM_PROMPT,
      '--output-format',
      'json',
      '--model',
      env.summaryModel,
    ]

    // stdin 은 ignore — 없으면 CLI 가 3초간 stdin 을 기다린다
    const child = spawn('claude', args, {
      cwd: SUMMARIZER_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      console.error('[summaries] claude CLI 타임아웃')
      resolve(null)
    }, CLI_TIMEOUT_MS)

    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (err) => {
      clearTimeout(timer)
      console.error('[summaries] claude CLI 실행 실패 (설치·로그인 확인):', err)
      resolve(null)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        console.error(`[summaries] claude CLI exit ${code}: ${stderr.slice(0, 200)}`)
        resolve(null)
        return
      }
      try {
        // json 봉투의 result 필드가 모델의 최종 텍스트다
        const envelope = JSON.parse(stdout) as { is_error?: boolean; result?: string }
        if (envelope.is_error || typeof envelope.result !== 'string') {
          resolve(null)
          return
        }
        resolve(parseSummaryResponse(envelope.result))
      } catch {
        resolve(null)
      }
    })
  })
}

async function main(): Promise<void> {
  const env = await loadEnv()
  await mkdir(SUMMARIZER_DIR, { recursive: true })
  const state = await readState(STATE_FILE)

  const sessions = await scanSessions()
  const changed = sessions.filter((s) => {
    // claude CLI 자신이 만든 세션은 재귀 요약을 막기 위해 제외
    if (s.filePath.startsWith(SUMMARIZER_DIR)) return false
    const prev = state[s.sessionId]
    return prev === undefined || s.lastModified > prev
  })

  if (changed.length === 0) {
    console.log('[summaries] 변경된 세션 없음')
    return
  }

  const succeeded: Array<{ path: string; mtimeMs: number }> = []
  let done = 0
  for (const session of changed) {
    const events = await parseSessionEvents(session)
    const transcript = buildTranscript(events)
    if (!transcript.trim()) continue

    const summary = await runClaudeSummary(env, transcript)
    if (!summary) continue

    const payload = {
      sessionId: session.sessionId,
      title: summary.title,
      description: summary.description,
      generatedAt: new Date().toISOString(),
    }

    // 로컬 사이드카 기록 (dev 환경에서도 즉시 반영)
    const projectDir = dirname(session.filePath)
    await writeFile(
      join(projectDir, `${session.sessionId}.summary.json`),
      JSON.stringify(payload, null, 2),
      'utf8',
    )

    // 클라우드 업로드
    try {
      await putJson(
        env,
        `/api/sync/summary/${encodeURIComponent(session.sessionId)}?encoded=${encodeURIComponent(session.projectEncoded)}`,
        payload,
      )
    } catch (err) {
      console.error(`[summaries] ${session.sessionId} 업로드 실패:`, err)
    }

    // state 키는 sessionId — updateState 는 path 키를 쓰므로 여기선 sessionId 를 넘긴다
    succeeded.push({ path: session.sessionId, mtimeMs: session.lastModified })
    done++
    console.log(`[summaries] ${session.sessionId.slice(0, 8)} → ${summary.title}`)
  }

  await writeState(STATE_FILE, updateState(state, succeeded))
  console.log(`[summaries] ${done}/${changed.length}개 세션 요약 완료`)
}

main().catch((err) => {
  console.error('[summaries] 실패:', err)
  process.exit(1)
})
