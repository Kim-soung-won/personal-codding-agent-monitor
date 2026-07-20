import { describe, it, expect } from 'vitest'
import {
  aggregateUsageByModel,
  calcCostUsd,
  collectUsage,
  dedupeByRequest,
  resolvePricing,
  DEFAULT_FALLBACK_PRICING,
} from '../../../shared/pricing.js'

const usage = { inputTokens: 1_000_000, outputTokens: 0, cacheWrite: 0, cacheRead: 0 }

/** 실제 JSONL 형태: 한 응답이 여러 라인에 쪼개지고 usage가 반복된다 */
function line(requestId: string, outputTokens: number, cacheRead: number) {
  return {
    raw: {
      type: 'assistant',
      requestId,
      message: {
        model: 'claude-opus-4-8',
        usage: {
          input_tokens: 2,
          output_tokens: outputTokens,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: cacheRead,
        },
      },
    },
  }
}

describe('dedupeByRequest — 라인 중복 계상 방지', () => {
  it('같은 requestId의 라인은 1건으로 합쳐진다', () => {
    // 실측 사례: 3개 라인이 cacheRead 48895를 각각 반복
    const entries = collectUsage([
      line('req_A', 2, 48895),
      line('req_A', 2, 48895),
      line('req_A', 246, 48895),
    ])

    expect(entries).toHaveLength(1)
    expect(entries[0].usage.cacheRead).toBe(48895) // 146685(=3배)가 아니어야 함
  })

  it('output_tokens가 최대인 라인(최종 스냅샷)을 남긴다', () => {
    const entries = collectUsage([line('req_A', 4, 100), line('req_A', 444, 100)])
    expect(entries[0].usage.outputTokens).toBe(444)
  })

  it('서로 다른 requestId는 각각 유지된다', () => {
    const entries = collectUsage([line('req_A', 10, 100), line('req_B', 20, 200)])
    expect(entries).toHaveLength(2)
  })

  it('requestId가 없으면 개별 요청으로 취급 (합쳐서 잃지 않는다)', () => {
    const noId = { raw: { type: 'assistant', message: { usage: { input_tokens: 5 } } } }
    expect(collectUsage([noId, noId])).toHaveLength(2)
  })

  it('중복 제거 전후 비용 차이 — 회귀 검증', () => {
    const raw = [line('req_A', 2, 48895), line('req_A', 2, 48895), line('req_A', 246, 48895)]
    const naive = raw.map((r) => {
      const u = (r.raw.message.usage)
      return {
        usage: {
          inputTokens: u.input_tokens,
          outputTokens: u.output_tokens,
          cacheWrite: 0,
          cacheRead: u.cache_read_input_tokens,
        },
        model: 'claude-opus-4-8',
        requestId: 'req_A',
      }
    })

    const inflated = aggregateUsageByModel(naive).totalCostUsd
    const correct = aggregateUsageByModel(dedupeByRequest(naive)).totalCostUsd

    expect(inflated).toBeGreaterThan(correct)
    expect(correct).toBeLessThan(inflated / 2)
  })
})

describe('resolvePricing', () => {
  it('알려진 모델은 정확한 단가를 반환', () => {
    const { pricing, isUnknown } = resolvePricing('claude-opus-4-8')
    expect(isUnknown).toBe(false)
    expect(pricing.inputPerM).toBe(5)
    expect(pricing.outputPerM).toBe(25)
  })

  it('날짜 접미사가 붙은 ID도 접두사 매칭으로 해석', () => {
    const { pricing, isUnknown } = resolvePricing('claude-haiku-4-5-20251001')
    expect(isUnknown).toBe(false)
    expect(pricing.inputPerM).toBe(1)
    expect(pricing.outputPerM).toBe(5)
  })

  it('미지의 모델은 폴백 단가 + isUnknown', () => {
    const { pricing, isUnknown } = resolvePricing('claude-3-unknown-999')
    expect(isUnknown).toBe(true)
    expect(pricing).toEqual(DEFAULT_FALLBACK_PRICING)
  })

  it('model이 undefined면 unknown 취급', () => {
    expect(resolvePricing(undefined).isUnknown).toBe(true)
  })

  it('캐시 단가는 input 대비 1.25배 / 0.1배', () => {
    const { pricing } = resolvePricing('claude-sonnet-4-6')
    expect(pricing.cacheWritePerM).toBeCloseTo(3.75, 10)
    expect(pricing.cacheReadPerM).toBeCloseTo(0.3, 10)
  })
})

describe('calcCostUsd', () => {
  it('Sonnet 기준값은 기존 하드코딩 공식과 동일 (회귀 검증)', () => {
    const mixed = {
      inputTokens: 1000,
      outputTokens: 2000,
      cacheWrite: 3000,
      cacheRead: 4000,
    }
    const expected = (1000 * 3 + 2000 * 15 + 3000 * 3.75 + 4000 * 0.3) / 1_000_000

    expect(calcCostUsd(mixed, 'claude-sonnet-4-6')).toBeCloseTo(expected, 12)
  })

  it('모델에 따라 비용이 달라진다', () => {
    expect(calcCostUsd(usage, 'claude-opus-4-8')).toBeCloseTo(5, 10)
    expect(calcCostUsd(usage, 'claude-haiku-4-5')).toBeCloseTo(1, 10)
  })

  it('<synthetic> 은 비용 0', () => {
    expect(calcCostUsd(usage, '<synthetic>')).toBe(0)
  })
})

describe('aggregateUsageByModel', () => {
  it('모델별 단가로 합산하고 토큰 총계를 낸다', () => {
    const result = aggregateUsageByModel([
      { usage, model: 'claude-opus-4-8', requestId: undefined },
      { usage, model: 'claude-haiku-4-5', requestId: undefined },
    ])

    expect(result.totalCostUsd).toBeCloseTo(6, 10)
    expect(result.totals.inputTokens).toBe(2_000_000)
    expect(result.unknownModels).toEqual([])
  })

  it('폴백된 모델을 unknownModels로 노출', () => {
    const result = aggregateUsageByModel([{ usage, model: 'claude-mystery-9', requestId: undefined }])
    expect(result.unknownModels).toEqual(['claude-mystery-9'])
  })

  it('<synthetic> 은 unknownModels에 포함하지 않는다', () => {
    const result = aggregateUsageByModel([{ usage, model: '<synthetic>', requestId: undefined }])
    expect(result.unknownModels).toEqual([])
  })
})
