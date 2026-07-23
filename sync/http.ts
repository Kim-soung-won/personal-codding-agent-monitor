/**
 * 클라우드 서버 업로드 및 환경설정 로딩(I/O 계층).
 */

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnvFile } from './core.js'

const here = dirname(fileURLToPath(import.meta.url))

export interface SyncEnv {
  cloudUrl: string
  authToken: string
  /** 요약 생성에 쓸 Claude Code CLI 모델 (--model 값). 기본 haiku */
  summaryModel: string
}

/**
 * sync/.env 파일과 process.env 를 병합해 설정을 읽는다(process.env 우선).
 *
 * 요약은 로컬 `claude` CLI(구독 인증)로 생성하므로 API 키가 필요 없다.
 */
export async function loadEnv(): Promise<SyncEnv> {
  let fileEnv: Record<string, string> = {}
  try {
    fileEnv = parseEnvFile(await readFile(join(here, '.env'), 'utf8'))
  } catch {
    // .env 없음 — process.env 만 사용
  }
  const get = (k: string): string | undefined => process.env[k] ?? fileEnv[k]

  const cloudUrl = get('CLOUD_URL')
  const authToken = get('AUTH_TOKEN')
  const summaryModel = get('OBSERVER_SUMMARY_MODEL') ?? 'haiku'

  if (!cloudUrl) throw new Error('CLOUD_URL 미설정 (sync/.env 또는 환경변수)')
  if (!authToken) throw new Error('AUTH_TOKEN 미설정 (sync/.env 또는 환경변수)')

  return { cloudUrl: cloudUrl.replace(/\/$/, ''), authToken, summaryModel }
}

export interface UploadIdentity {
  email: string
  name?: string
}

/** 인증 헤더로 raw text 를 PUT 한다. identity 가 있으면 X-User-* 헤더로 함께 전송. */
export async function putText(
  env: SyncEnv,
  path: string,
  body: string,
  identity?: UploadIdentity,
): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.authToken}`,
    'Content-Type': 'text/plain',
  }
  if (identity) {
    headers['X-User-Email'] = identity.email
    if (identity.name) headers['X-User-Name'] = identity.name
  }
  const res = await fetch(`${env.cloudUrl}${path}`, { method: 'PUT', headers, body })
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`)
}

/** 인증 헤더로 JSON 을 PUT 한다. */
export async function putJson(env: SyncEnv, path: string, body: unknown): Promise<void> {
  const res = await fetch(`${env.cloudUrl}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`)
}
