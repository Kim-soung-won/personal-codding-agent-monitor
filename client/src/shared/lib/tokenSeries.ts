/**
 * 토큰 종류(입력·출력·캐시 읽기·캐시 생성)의 색·라벨 단일 소스.
 *
 * 리소스 종류(KIND_HEX)와 색을 공유하지 않는다 — 같은 화면에 두 축의 범례가
 * 나란히 서므로 색이 겹치면 "보라 = Skill 인가 입력 토큰인가"가 된다.
 * 라이트/다크는 반전이 아니라 표면별로 따로 고른 값이고, 둘 다 색각 이상 분리도
 * (인접쌍 ΔE) 검증을 통과한 조합이다.
 */

/** key 는 서버 DailyTokenRow 의 필드명과 1:1 이다. */
export const TOKEN_SERIES = [
  { key: 'inputTokens',   label: '입력',      light: '#2a78d6', dark: '#3987e5' },
  { key: 'outputTokens',  label: '출력',      light: '#eb6834', dark: '#d95926' },
  { key: 'cacheRead',     label: '캐시 읽기', light: '#1baf7a', dark: '#199e70' },
  { key: 'cacheCreation', label: '캐시 생성', light: '#eda100', dark: '#c98500' },
] as const

export type TokenSeriesKey = (typeof TOKEN_SERIES)[number]['key']

/** 토큰 수 축약 표기. 축 라벨과 툴팁이 같은 규칙을 쓰도록 한 곳에 둔다. */
export function compactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}
