import { describe, it, expect, vi } from 'vitest'
import type { Request, Response } from 'express'
import { createAuthMiddleware, isWsAuthorized } from '../middleware/auth.js'

const TOKEN = 'secret-token-123'

function mockRes(): Response & { statusCode?: number; body?: unknown } {
  const res = {} as Response & { statusCode?: number; body?: unknown }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  }) as unknown as Response['status']
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  }) as unknown as Response['json']
  return res
}

describe('createAuthMiddleware', () => {
  const mw = createAuthMiddleware(TOKEN)

  it('올바른 Bearer 토큰 → next() 호출', () => {
    const req = { headers: { authorization: `Bearer ${TOKEN}` } } as Request
    const res = mockRes()
    const next = vi.fn()
    mw(req, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('토큰 불일치 → 401', () => {
    const req = { headers: { authorization: 'Bearer wrong' } } as Request
    const res = mockRes()
    const next = vi.fn()
    mw(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })

  it('Authorization 헤더 없음 → 401', () => {
    const req = { headers: {} } as Request
    const res = mockRes()
    const next = vi.fn()
    mw(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })

  it('길이가 다른 토큰도 안전하게 거부', () => {
    const req = { headers: { authorization: 'Bearer short' } } as Request
    const res = mockRes()
    const next = vi.fn()
    mw(req, res, next)
    expect(res.statusCode).toBe(401)
  })
})

describe('isWsAuthorized', () => {
  it('올바른 ?token= → true', () => {
    expect(isWsAuthorized(`/?token=${TOKEN}`, TOKEN)).toBe(true)
  })

  it('토큰 불일치 → false', () => {
    expect(isWsAuthorized('/?token=wrong', TOKEN)).toBe(false)
  })

  it('token 파라미터 없음 → false', () => {
    expect(isWsAuthorized('/', TOKEN)).toBe(false)
  })

  it('url 없음 → false', () => {
    expect(isWsAuthorized(undefined, TOKEN)).toBe(false)
  })
})
