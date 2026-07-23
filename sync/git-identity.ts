import { promisify } from 'node:util'
import { exec as execCb } from 'node:child_process'

const exec = promisify(execCb)

export interface GitIdentity {
  email: string
  name?: string
}

/**
 * 로컬 git 설정에서 사용자 신원을 읽는다(서버가 user 로 귀속하는 데 사용).
 * git 없음/미설정 시 undefined → 서버는 'unknown' 유저로 처리.
 */
export async function getGitIdentity(): Promise<GitIdentity | undefined> {
  try {
    const { stdout } = await exec('git config user.email')
    const email = stdout.trim()
    if (!email) return undefined
    let name: string | undefined
    try {
      const r = await exec('git config user.name')
      name = r.stdout.trim() || undefined
    } catch {
      // name 없음 — email 만으로 충분
    }
    return { email, name }
  } catch {
    return undefined
  }
}
