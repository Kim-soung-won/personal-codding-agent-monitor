/**
 * 차트 공통 시각 토큰.
 *
 * 다크 모드는 라이트 값을 뒤집어 쓰지 않고 표면별로 따로 고른다 — 자동 반전은
 * 어두운 배경에서 격자가 눈에 띄게 튄다.
 * 잉크(축·범례·툴팁 글자)는 시리즈 색을 절대 쓰지 않는다. 정체성은 옆의 마크가 나른다.
 */
import type { ChartTheme } from './types'

interface ChartTokens {
  /** 축 라벨·범례 글자 */
  ink: string
  /** 축 선 */
  axisLine: string
  /** 값 격자선 — 배경으로 물러나야 한다 */
  splitLine: string
  /** 툴팁 배경/테두리 */
  tooltipBg: string
  tooltipBorder: string
  /** 겹치는 마크를 떼어내는 표면색 링·간격 */
  surface: string
}

const TOKENS: Record<ChartTheme, ChartTokens> = {
  light: {
    ink: '#475569',
    axisLine: '#cbd5e1',
    splitLine: '#e2e8f0',
    tooltipBg: '#ffffff',
    tooltipBorder: '#e2e8f0',
    surface: '#ffffff',
  },
  dark: {
    ink: '#94a3b8',
    axisLine: '#3f3f46',
    splitLine: '#27272a',
    tooltipBg: '#18181b',
    tooltipBorder: '#3f3f46',
    surface: '#18181b',
  },
}

export function chartTokens(theme: ChartTheme): ChartTokens {
  return TOKENS[theme]
}

/** 툴팁 공통 설정. 호버 레이어는 기본 탑재이고 끄지 않는다. */
export function tooltipOption(theme: ChartTheme) {
  const t = chartTokens(theme)
  return {
    backgroundColor: t.tooltipBg,
    borderColor: t.tooltipBorder,
    borderWidth: 1,
    padding: [6, 10] as [number, number],
    textStyle: { color: t.ink, fontSize: 12 },
    // 긴 이름(plugin:resource)이 한 줄로 뻗어 화면 밖으로 나가지 않게 접는다.
    extraCssText:
      'box-shadow: 0 4px 12px rgba(0,0,0,0.12); border-radius: 8px; max-width: 320px; white-space: normal; word-break: break-all;',
  }
}

/** 범례 공통 설정. 시리즈가 2개 이상이면 항상 띄운다(색만으로 식별시키지 않는다). */
export function legendOption(theme: ChartTheme, show: boolean) {
  return {
    show,
    bottom: 0,
    icon: 'circle',
    itemWidth: 8,
    itemHeight: 8,
    itemGap: 14,
    textStyle: { color: chartTokens(theme).ink, fontSize: 11 },
  }
}

/**
 * 카테고리 축(가로) 공통 설정.
 * showLabels=false 면 축 라벨을 지운다 — 축약도 줄바꿈도 마땅치 않은 긴 이름은
 * 축에 눕혀 놓느니 지우고 호버 툴팁으로 온전히 보여주는 편이 읽힌다.
 */
export function categoryAxisOption(theme: ChartTheme, rotate = 0, showLabels = true) {
  const t = chartTokens(theme)
  return {
    type: 'category' as const,
    axisLine: { lineStyle: { color: t.axisLine } },
    axisTick: { show: false },
    axisLabel: { show: showLabels, color: t.ink, fontSize: 11, rotate, hideOverlap: true },
  }
}

interface ValueAxisOpts {
  unit?: string
  /** 값 표기 함수. 주면 unit 대신 이쪽을 쓴다(토큰처럼 자릿수가 큰 값). */
  format?: (v: number) => string
  /** 눈금을 정수로 고정. 호출 횟수처럼 소수가 의미 없는 값에 준다. */
  integer?: boolean
}

/**
 * 값 축(세로) 공통 설정. 축선은 지우고 옅은 격자만 남긴다.
 */
export function valueAxisOption(theme: ChartTheme, { unit, format, integer }: ValueAxisOpts = {}) {
  const t = chartTokens(theme)
  return {
    type: 'value' as const,
    // 최댓값이 2 인데 눈금이 0.2 단위로 잘리면 "0.8회" 같은 없는 값이 축에 뜬다.
    ...(integer ? { minInterval: 1 } : {}),
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: t.splitLine } },
    axisLabel: {
      color: t.ink,
      fontSize: 11,
      formatter: format ? (v: number) => format(v) : unit ? `{value}${unit}` : '{value}',
    },
  }
}
