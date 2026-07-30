/**
 * 배포 대상별 API 엔드포인트와 토큰을 다루는 단일 소스.
 *
 * VITE_API_BASE / VITE_WS_URL 은 Vite 빌드타임 상수라 배포 대상이 바뀌면
 * 클라이언트를 재빌드해야 한다(README 참조). 토큰은 번들에 굽지 않고
 * localStorage 에 런타임 저장해 클라이언트 번들에 시크릿이 남지 않게 한다.
 */

const TOKEN_KEY = 'observer_auth_token'

export function getApiBase(): string {
  return import.meta.env.VITE_API_BASE ?? 'http://localhost:3001'
}

export function getWsUrl(): string {
  return import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001'
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // localStorage 불가 환경 — 무시(메모리 세션으로는 동작 못함)
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 무시
  }
}

/** 저장된 토큰을 Authorization 헤더로 변환한다. 토큰 없으면 빈 객체. */
export function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * API_BASE 를 붙이고 토큰 헤더를 자동 주입하는 fetch 래퍼.
 * path 는 '/api/...' 형태의 절대 경로를 받는다.
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  })
}
