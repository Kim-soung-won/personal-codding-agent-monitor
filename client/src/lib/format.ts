/** 토큰 수를 1.2M / 34K 처럼 축약한다. */
export function compactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

// Claude 토큰 단가(USD / 1M). groupChatTurns.ts 의 턴 단위 추정과 같은 계수 —
// 한쪽만 바꾸지 않는다.
const PRICE_PER_MTOK = {
  input: 3.0,
  output: 15.0,
  cacheWrite: 3.75,
  cacheRead: 0.3,
} as const

interface TokenUsage {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

/** 토큰 사용량을 예상 비용(USD)으로 환산한다. */
export function estimateCostUsd({ input, output, cacheWrite, cacheRead }: TokenUsage): number {
  return (
    (input * PRICE_PER_MTOK.input +
      output * PRICE_PER_MTOK.output +
      cacheWrite * PRICE_PER_MTOK.cacheWrite +
      cacheRead * PRICE_PER_MTOK.cacheRead) /
    1_000_000
  )
}

/** 예상 비용을 표기용 문자열로. $0.42 처럼 소액이면 센트까지, 그 이상은 두 자리. */
export function fmtUsd(usd: number): string {
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

/**
 * 컨텍스트 재사용률 = cache read / (cache read + cache write).
 * 이미 쌓인 컨텍스트를 다시 만들지 않고 재사용한 비율. 재구축(write)이 많을수록 낮다.
 * 재구축이 전혀 없으면(둘 다 0) 산출 불가(null).
 */
export function contextReuseRate(cacheRead: number, cacheWrite: number): number | null {
  const denom = cacheRead + cacheWrite
  if (denom === 0) return null
  return (cacheRead / denom) * 100
}
