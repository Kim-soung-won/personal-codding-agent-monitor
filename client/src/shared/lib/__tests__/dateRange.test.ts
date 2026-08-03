import { describe, it, expect } from 'vitest'
import { enumerateDays, toDayKey } from '@/shared/lib/dateRange'

describe('enumerateDays', () => {
  it('양끝을 포함해 하루도 빠뜨리지 않는다', () => {
    expect(enumerateDays('2026-07-28', '2026-08-03')).toEqual([
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ])
  })

  it('같은 날이면 그 하루만 돌려준다', () => {
    expect(enumerateDays('2026-08-03', '2026-08-03')).toEqual(['2026-08-03'])
  })

  it('뒤집힌 구간은 빈 배열 — 축이 무한히 늘어나지 않는다', () => {
    expect(enumerateDays('2026-08-03', '2026-07-28')).toEqual([])
  })

  it('형식이 아닌 값은 빈 배열', () => {
    expect(enumerateDays('', '2026-08-03')).toEqual([])
  })

  it('월·연 경계를 넘어간다', () => {
    expect(enumerateDays('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
  })

  it('윤년 2월 29일을 빠뜨리지 않는다', () => {
    expect(enumerateDays('2028-02-27', '2028-03-01')).toEqual([
      '2028-02-27',
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ])
  })
})

describe('toDayKey', () => {
  it('로컬 기준 YYYY-MM-DD 로 찍는다(UTC 변환으로 하루 밀리지 않는다)', () => {
    expect(toDayKey(new Date(2026, 7, 3, 23, 30))).toBe('2026-08-03')
    expect(toDayKey(new Date(2026, 7, 3, 0, 30))).toBe('2026-08-03')
  })
})
