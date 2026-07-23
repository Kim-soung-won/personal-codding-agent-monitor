/**
 * 대화형 설치·설정 스크립트: `npm run setup`.
 *
 * 1) sync/.env 작성(기존 값은 기본값으로 제시)
 * 2) 사전 점검 — `claude` CLI 로그인 여부, 클라우드 토큰 유효성
 * 3) launchd 등록(매일 지정 시각) — run.sh 절대경로·PATH 를 주입한 plist 생성 후 launchctl load
 *
 * launchd 등록은 사용자 확인(Y/n) 후에만 수행한다(영속 설정 변경).
 */

import { createInterface } from 'node:readline'
import { stdin, stdout, execPath } from 'node:process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import { exec as execCb } from 'node:child_process'
import { parseEnvFile } from './core.js'

const exec = promisify(execCb)
const here = dirname(fileURLToPath(import.meta.url))

// readline 을 async iterator 로 소비 — TTY(대화형)와 파이프(자동화) 양쪽에서 동작.
// (readline/promises 의 question() 은 파이프 입력에서 첫 줄만 읽고 멈추는 문제가 있다)
const rl = createInterface({ input: stdin })
const lines = rl[Symbol.asyncIterator]()

async function ask(question: string, fallback = ''): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : ''
  stdout.write(`${question}${suffix}: `)
  const { value, done } = await lines.next()
  if (done) return fallback
  const answer = String(value ?? '').trim()
  return answer || fallback
}

async function loadExistingEnv(): Promise<Record<string, string>> {
  try {
    return parseEnvFile(await readFile(join(here, '.env'), 'utf8'))
  } catch {
    return {}
  }
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await exec(`command -v ${cmd}`)
    return true
  } catch {
    return false
  }
}

/** 클라우드 토큰이 유효한지 GET /api/sessions 로 점검. */
async function checkToken(cloudUrl: string, token: string): Promise<'ok' | 'unauthorized' | 'unreachable'> {
  try {
    const res = await fetch(`${cloudUrl.replace(/\/$/, '')}/api/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) return 'ok'
    if (res.status === 401) return 'unauthorized'
    return 'unreachable'
  } catch {
    return 'unreachable'
  }
}

function buildPlist(runShPath: string, hour: number, minute: number, extraPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.observer.sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${runShPath}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>${hour}</integer>
    <key>Minute</key><integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key><string>/tmp/observer-sync.out.log</string>
  <key>StandardErrorPath</key><string>/tmp/observer-sync.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${extraPath}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
`
}

async function main(): Promise<void> {
  console.log('\n=== Claude Code Observer — 로컬 동기화 잡 설정 ===\n')
  const prev = await loadExistingEnv()

  // 1) .env
  console.log('[1/3] 연결 설정')
  const cloudUrl = await ask('클라우드 서버 URL', prev.CLOUD_URL ?? 'https://observer.example.com')
  const authToken = await ask('접근 토큰(AUTH_TOKEN, 서버와 동일)', prev.AUTH_TOKEN ?? '')
  const model = await ask('요약 모델(claude --model)', prev.OBSERVER_SUMMARY_MODEL ?? 'haiku')

  const envBody =
    `# claude-code-observer sync 설정 (npm run setup 으로 생성)\n` +
    `CLOUD_URL=${cloudUrl}\n` +
    `AUTH_TOKEN=${authToken}\n` +
    `OBSERVER_SUMMARY_MODEL=${model}\n`
  await writeFile(join(here, '.env'), envBody, 'utf8')
  console.log('  → sync/.env 저장 완료\n')

  // 2) 사전 점검
  console.log('[2/3] 사전 점검')
  const hasClaude = await commandExists('claude')
  console.log(`  claude CLI: ${hasClaude ? '✅ 설치됨' : '❌ 없음 — 요약 생성 불가(설치·로그인 필요)'}`)
  if (authToken) {
    const tokenState = await checkToken(cloudUrl, authToken)
    const label =
      tokenState === 'ok'
        ? '✅ 인증 성공'
        : tokenState === 'unauthorized'
          ? '❌ 토큰 불일치(401)'
          : '⚠️ 서버 연결 실패(주소·기동 확인)'
    console.log(`  서버 인증: ${label}`)
  } else {
    console.log('  서버 인증: ⚠️ 토큰 미입력 — 나중에 sync/.env 에 채우세요')
  }
  console.log('')

  // 3) launchd 등록 (선택)
  console.log('[3/3] 자동 실행(launchd) 등록')
  const register = (await ask('매일 자동 실행을 등록할까요? (y/N)', 'N')).toLowerCase()
  if (register === 'y' || register === 'yes') {
    const hourStr = await ask('실행 시각(시, 0-23)', '19')
    const hour = Math.min(23, Math.max(0, Number(hourStr) || 19))
    const runSh = join(here, 'run.sh')
    const nodeBinDir = dirname(execPath) // node/tsx/claude 가 함께 설치된 경로 포함
    const plist = buildPlist(runSh, hour, 0, nodeBinDir)

    const agentsDir = join(homedir(), 'Library', 'LaunchAgents')
    const plistPath = join(agentsDir, 'com.observer.sync.plist')
    await mkdir(agentsDir, { recursive: true })
    await writeFile(plistPath, plist, 'utf8')

    try {
      await exec(`launchctl unload "${plistPath}"`).catch(() => {})
      await exec(`launchctl load -w "${plistPath}"`)
      console.log(`  → 등록 완료: 매일 ${hour}:00 실행 (${plistPath})`)
      console.log('  해제하려면: launchctl unload ~/Library/LaunchAgents/com.observer.sync.plist')
    } catch (err) {
      console.log(`  ⚠️ launchctl 등록 실패: ${String(err)}`)
      console.log(`  plist 는 생성됨(${plistPath}) — 수동으로 launchctl load 하세요.`)
    }
  } else {
    console.log('  건너뜀. 수동 실행: cd sync && npm run all')
  }

  console.log('\n설정 완료. 지금 한 번 실행하려면: npm run all\n')
  rl.close()
}

main().catch((err) => {
  console.error('[setup] 실패:', err)
  rl.close()
  process.exit(1)
})
