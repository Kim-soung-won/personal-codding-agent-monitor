/**
 * 모델별 토큰 단가와 usage 집계 로직의 단일 소스.
 *
 * server/ 와 client/ 양쪽에서 import 한다 (server: 상대경로, client: @shared alias).
 * 단가를 고칠 때 이 파일만 수정하면 API 응답과 화면 숫자가 함께 바뀐다.
 */

export interface ModelPricing {
  inputPerM: number
  outputPerM: number
  cacheWritePerM: number
  cacheReadPerM: number
}

export interface UsageTokens {
  inputTokens: number
  outputTokens: number
  cacheWrite: number
  cacheRead: number
}

export interface UsageEntry {
  usage: UsageTokens
  model: string | undefined
  /** 같은 API 응답에서 나온 라인들을 묶는 키 */
  requestId: string | undefined
}

export interface UsageAggregate {
  totalCostUsd: number
  totals: UsageTokens
  /** 단가 테이블에 없어 폴백 단가가 적용된 모델 ID 목록 */
  unknownModels: string[]
}

/**
 * 캐시 단가는 Anthropic 표준 비율을 따른다 — write = input × 1.25 (5분 TTL),
 * read = input × 0.1.
 */
function withCacheRates(inputPerM: number, outputPerM: number): ModelPricing {
  return {
    inputPerM,
    outputPerM,
    cacheWritePerM: inputPerM * 1.25,
    cacheReadPerM: inputPerM * 0.1,
  }
}

/** 내부 합성 메시지. usage가 항상 0이라 비용도 0이며 unknown 집계에서 제외한다. */
export const SYNTHETIC_MODEL = '<synthetic>'

export const PRICING_TABLE: Record<string, ModelPricing> = {
  'claude-fable-5': withCacheRates(10.0, 50.0),
  'claude-mythos-5': withCacheRates(10.0, 50.0),
  'claude-opus-4-8': withCacheRates(5.0, 25.0),
  'claude-opus-4-7': withCacheRates(5.0, 25.0),
  'claude-opus-4-6': withCacheRates(5.0, 25.0),
  'claude-opus-4-5': withCacheRates(5.0, 25.0),
  'claude-sonnet-5': withCacheRates(3.0, 15.0),
  'claude-sonnet-4-6': withCacheRates(3.0, 15.0),
  'claude-sonnet-4-5': withCacheRates(3.0, 15.0),
  'claude-haiku-4-5': withCacheRates(1.0, 5.0),
  [SYNTHETIC_MODEL]: { inputPerM: 0, outputPerM: 0, cacheWritePerM: 0, cacheReadPerM: 0 },
}

/** 미지의 모델에 적용할 폴백. 기존 하드코딩 값과 동일해 회귀가 없다. */
export const DEFAULT_FALLBACK_PRICING: ModelPricing = PRICING_TABLE['claude-sonnet-4-6']

// 긴 키부터 매칭해야 claude-opus-4-8 이 claude-opus-4 보다 먼저 잡힌다
const PRICING_KEYS = Object.keys(PRICING_TABLE).sort((a, b) => b.length - a.length)

/**
 * 모델 ID에 해당하는 단가를 찾는다.
 *
 * JSONL의 model 필드에는 날짜 접미사가 붙기도 하므로
 * (예: claude-haiku-4-5-20251001) 접두사 매칭까지 시도한다.
 */
export function resolvePricing(model: string | undefined): {
  pricing: ModelPricing
  isUnknown: boolean
} {
  if (!model) return { pricing: DEFAULT_FALLBACK_PRICING, isUnknown: true }

  for (const key of PRICING_KEYS) {
    if (model === key || model.startsWith(`${key}-`)) {
      return { pricing: PRICING_TABLE[key], isUnknown: false }
    }
  }
  return { pricing: DEFAULT_FALLBACK_PRICING, isUnknown: true }
}

/** 단일 호출의 usage를 모델 단가로 환산한 USD 비용. */
export function calcCostUsd(usage: UsageTokens, model: string | undefined): number {
  const { pricing } = resolvePricing(model)
  return (
    (usage.inputTokens * pricing.inputPerM +
      usage.outputTokens * pricing.outputPerM +
      usage.cacheWrite * pricing.cacheWritePerM +
      usage.cacheRead * pricing.cacheReadPerM) /
    1_000_000
  )
}

/** 여러 호출의 usage를 모델별 단가로 합산한다. */
export function aggregateUsageByModel(entries: UsageEntry[]): UsageAggregate {
  const totals: UsageTokens = { inputTokens: 0, outputTokens: 0, cacheWrite: 0, cacheRead: 0 }
  const unknown = new Set<string>()
  let totalCostUsd = 0

  for (const { usage, model } of entries) {
    totals.inputTokens += usage.inputTokens
    totals.outputTokens += usage.outputTokens
    totals.cacheWrite += usage.cacheWrite
    totals.cacheRead += usage.cacheRead
    totalCostUsd += calcCostUsd(usage, model)

    const { isUnknown } = resolvePricing(model)
    if (isUnknown && model) unknown.add(model)
  }

  return { totalCostUsd, totals, unknownModels: [...unknown].sort() }
}

/** assistant 이벤트의 message.usage 를 UsageTokens 로 정규화한다. */
export function readUsage(raw: unknown): UsageEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const event = raw as Record<string, unknown>
  if (event.type !== 'assistant') return null

  const message = event.message as Record<string, unknown> | undefined
  const usage = message?.usage as Record<string, number> | undefined
  if (!usage) return null

  return {
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
    },
    model: typeof message?.model === 'string' ? message.model : undefined,
    requestId: typeof event.requestId === 'string' ? event.requestId : undefined,
  }
}

/**
 * requestId 기준으로 usage를 1건만 남긴다.
 *
 * Claude Code는 한 API 응답을 content block(thinking / tool_use / text) 단위로
 * 여러 JSONL 라인에 나눠 기록하면서 **같은 usage를 매 라인에 반복**해 넣는다.
 * 라인을 그대로 합산하면 input·cache 토큰이 라인 수만큼 배로 부풀려진다
 * (실측: 요청당 1.7~3.0 라인 → 비용 1.7~2.6배 과대 계상).
 *
 * output_tokens 는 라인마다 누적 스냅샷이라 최댓값이 그 요청의 최종값이다.
 * requestId가 없는 라인은 개별 요청으로 취급한다.
 */
export function dedupeByRequest(entries: UsageEntry[]): UsageEntry[] {
  const byRequest = new Map<string, UsageEntry>()
  const standalone: UsageEntry[] = []

  for (const entry of entries) {
    if (!entry.requestId) {
      standalone.push(entry)
      continue
    }
    const prev = byRequest.get(entry.requestId)
    if (!prev || entry.usage.outputTokens > prev.usage.outputTokens) {
      byRequest.set(entry.requestId, entry)
    }
  }

  return [...byRequest.values(), ...standalone]
}

/** 이벤트 목록에서 요청 단위로 중복 제거된 usage를 뽑는다. */
export function collectUsage(events: Array<{ raw: unknown }>): UsageEntry[] {
  const entries: UsageEntry[] = []
  for (const ev of events) {
    const entry = readUsage(ev.raw)
    if (entry) entries.push(entry)
  }
  return dedupeByRequest(entries)
}
