import { z } from 'zod'
import type { AxiosResponse } from 'axios'

/**
 * 서버 응답 봉투(envelope): `{ success, data, error }`.
 * (mhub 의 `{message,data,result}` 와 다른 이 프로젝트 고유 형식 — README·CLAUDE.md 참조.)
 * 데이터 계약 검증은 이 봉투의 `data` 필드에 대해서만 한다.
 */

/** `data` 스키마를 받아 전체 봉투 스키마를 만든다. */
export function envelope<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema.nullable().optional(),
    error: z.string().optional(),
  })
}

/**
 * axios 응답에서 봉투를 zod 로 검증하고 `data` 를 꺼낸다.
 * - success=false 또는 data 부재 시 fallback 반환(방어적 — 기존 apiFetch 계약과 동일).
 * - 스키마 불일치는 개발 중 콘솔 경고만 남기고 파싱된 만큼 반환(런타임을 막지 않는다).
 */
export function unwrap<T extends z.ZodTypeAny>(
  res: AxiosResponse,
  dataSchema: T,
  fallback: z.infer<T>,
): z.infer<T> {
  const parsed = envelope(dataSchema).safeParse(res.data)
  if (!parsed.success) {
    if (import.meta.env.DEV) {
      console.warn('[api] 응답 스키마 불일치:', parsed.error.issues.slice(0, 3))
    }
    // 봉투 자체가 깨졌으면 원본 data 로 최선 시도, 그것도 아니면 fallback.
    const raw = (res.data as { data?: unknown })?.data
    const rawParsed = dataSchema.safeParse(raw)
    return rawParsed.success ? rawParsed.data : fallback
  }
  if (!parsed.data.success || parsed.data.data == null) return fallback
  return parsed.data.data as z.infer<T>
}
