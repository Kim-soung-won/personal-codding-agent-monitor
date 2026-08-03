/**
 * 차트 뷰 데이터 형태.
 * 사내 @we/ai-template 이 노출하던 타입을 대체한다 — 이름과 필드를 그대로 두어
 * 호출부가 라이브러리 교체를 눈치채지 않게 했다.
 */

export type ChartTheme = 'light' | 'dark'

/** 도넛: 카테고리 이름 + 값. */
export type CategoryDoughnutChartView = Array<{ name: string; value: number }>

/** 막대: 공유 카테고리 축 + 시리즈별 값 배열(카테고리와 같은 길이·순서). */
export interface BarChartView {
  categories: string[]
  series: Array<{ name: string; data: number[] }>
}

/** 날짜 라인: 타임스탬프 축 + 시리즈별 (timestamp, requests) 포인트. */
export interface DateLineChartView {
  timestamps: string[]
  series: Array<{
    name: string
    dataPoints: Array<{ timestamp: string; requests: number }>
  }>
}
