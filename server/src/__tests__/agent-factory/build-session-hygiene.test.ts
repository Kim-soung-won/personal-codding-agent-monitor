import { describe, it, expect } from 'vitest'
import { buildSessionHygiene, type IncomingSessionHygiene } from '../../agent-factory/record-service.js'

describe('buildSessionHygiene', () => {
  it('블록이 없으면 null 을 반환한다(행 미생성)', () => {
    expect(buildSessionHygiene('rec1', undefined)).toBeNull()
  })

  it('빈 객체도 null 을 반환한다', () => {
    expect(buildSessionHygiene('rec1', {})).toBeNull()
  })

  it('snake_case 를 camelCase 컬럼으로 매핑한다', () => {
    const h: IncomingSessionHygiene = {
      cache_read: 46000,
      cache_creation: 1100,
      cr_gen_ratio: 41.8,
      max_tool_result_len: 2000,
      tool_result_spikes: [{ len: 2000 }],
      max_turn_context: 36000,
      max_turn_context_jump: 29500,
      delta_shrank: false,
      context_size_sample: 36000,
      session_resets: 0,
      context_slope: 70000,
      context_samples: 3,
      context_series: [[1, 12000], [2, 24000], [3, 36000]],
      assistant_turns: 3,
    }
    expect(buildSessionHygiene('rec1', h)).toMatchObject({
      recordId: 'rec1',
      cacheRead: 46000,
      cacheCreation: 1100,
      crGenRatio: 41.8,
      maxToolResultLen: 2000,
      toolResultSpikes: [{ len: 2000 }],
      maxTurnContext: 36000,
      maxTurnContextJump: 29500,
      deltaShrank: false,
      contextSizeSample: 36000,
      sessionResets: 0,
      contextSlope: 70000,
      contextSamples: 3,
      contextSeries: [[1, 12000], [2, 24000], [3, 36000]],
      assistantTurns: 3,
    })
  })

  it('context_series 가 배열이 아니면 저장하지 않는다(방어적)', () => {
    const row = buildSessionHygiene('rec1', {
      cache_read: 100,
      // @ts-expect-error 잘못된 형태 방어 검증
      context_series: 'not-an-array',
    })!
    expect(row.contextSeries).toBeUndefined()
  })

  it('null 과 0 을 구별해 보존한다(?? 0 으로 뭉개지 않음)', () => {
    // cr_gen_ratio=null(산출 불가) 과 session_resets=0(실제 0회)은 다른 뜻이다.
    const row = buildSessionHygiene('rec1', {
      cr_gen_ratio: null,
      session_resets: 0,
      context_slope: null,
    })!
    expect(row.crGenRatio).toBeNull()
    expect(row.sessionResets).toBe(0)
    expect(row.contextSlope).toBeNull()
  })

  it('tool_result_spikes 는 10건으로 절단한다', () => {
    const spikes = Array.from({ length: 15 }, (_, i) => ({ len: i }))
    const row = buildSessionHygiene('rec1', { tool_result_spikes: spikes })!
    expect(row.toolResultSpikes).toHaveLength(10)
  })

  it('cache_read 하나만 와도 행을 만든다(부분 계량치)', () => {
    const row = buildSessionHygiene('rec1', { cache_read: 500 })!
    expect(row.cacheRead).toBe(500)
    expect(row.sessionResets).toBeUndefined()
  })

  it('스파이크의 turns_resident·rebilled_tokens 를 그대로 보존한다(Json passthrough)', () => {
    const row = buildSessionHygiene('rec1', {
      tool_result_spikes: [{ len: 8000, turns_resident: 50, rebilled_tokens: 100000 }],
    })!
    expect(row.toolResultSpikes).toEqual([
      { len: 8000, turns_resident: 50, rebilled_tokens: 100000 },
    ])
  })

  it('구버전 {len}만 있는 스파이크도 거부 없이 저장한다(하위호환)', () => {
    const row = buildSessionHygiene('rec1', { tool_result_spikes: [{ len: 3000 }] })!
    expect(row.toolResultSpikes).toEqual([{ len: 3000 }])
  })
})
