import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

/**
 * 토큰을 상수 시간에 비교한다. 길이가 다르면 즉시 false(타이밍 정보는 길이뿐).
 */
function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** `Authorization: Bearer <token>` 헤더에서 토큰을 추출한다. 없으면 null. */
function extractBearer(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1] : null
}

/**
 * REST 요청을 보호하는 Express 미들웨어를 만든다.
 * 토큰 불일치 시 401 을 반환한다.
 */
export function createAuthMiddleware(expectedToken: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = extractBearer(req.headers.authorization)
    if (!provided || !tokensMatch(provided, expectedToken)) {
      res.status(401).json({ success: false, error: 'unauthorized' })
      return
    }
    next()
  }
}

/**
 * WebSocket 업그레이드 요청의 `?token=` 쿼리를 검증한다.
 * WS 는 커스텀 헤더를 쓰기 어려워 쿼리 파라미터로 토큰을 받는다.
 */
export function isWsAuthorized(reqUrl: string | undefined, expectedToken: string): boolean {
  if (!reqUrl) return false
  // 두 번째 인자는 상대 URL 파싱용 더미 base
  const token = new URL(reqUrl, 'http://localhost').searchParams.get('token')
  return token != null && tokensMatch(token, expectedToken)
}
