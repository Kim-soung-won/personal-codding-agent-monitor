import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { EChart } from '../EChart'
import { categoryAxisOption, chartTokens, legendOption, tooltipOption, valueAxisOption } from '../chartTheme'
import type { ChartTheme, DateLineChartView } from '../types'

interface Props {
  data: DateLineChartView
  /** 시리즈 순서대로 적용할 hex 색 */
  colors?: string[]
  height?: string
  theme?: ChartTheme
  /** 값 축·툴팁에 붙는 단위(예: '회') */
  unit?: string
  /** 날짜 라벨 회전 각도. 날짜가 많을 때만 준다 */
  labelRotate?: number
  /** 값 표기 함수(축·툴팁 공용). 주면 unit 대신 이쪽을 쓴다 — 토큰처럼 큰 수에 */
  valueFormat?: (v: number) => string
}

/** 날짜 축 다중 라인. 십자선 툴팁으로 같은 날 전 시리즈를 한 번에 읽는다. */
export function DateLineChart({
  data,
  colors,
  height,
  theme = 'light',
  unit,
  labelRotate = 0,
  valueFormat,
}: Props) {
  const option = useMemo<EChartsOption>(() => {
    const t = chartTokens(theme)
    const multi = data.series.length > 1

    return {
      color: colors,
      grid: { left: 8, right: 12, top: 12, bottom: multi ? 28 : 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: t.axisLine } },
        ...tooltipOption(theme),
        valueFormatter: valueFormat
          ? (v) => valueFormat(Number(v))
          : unit
            ? (v) => `${v}${unit}`
            : undefined,
      },
      legend: legendOption(theme, multi),
      xAxis: { ...categoryAxisOption(theme, labelRotate), data: data.timestamps, boundaryGap: false },
      yAxis: valueAxisOption(theme, unit, valueFormat),
      series: data.series.map((s) => ({
        type: 'line' as const,
        name: s.name,
        // 축이 timestamps 순서를 정하므로 값만 그 순서대로 넘긴다.
        data: data.timestamps.map(
          (ts) => s.dataPoints.find((p) => p.timestamp === ts)?.requests ?? 0,
        ),
        smooth: false,
        symbol: 'circle',
        symbolSize: 8,
        showSymbol: data.timestamps.length <= 30,
        lineStyle: { width: 2 },
        // 겹치는 점을 표면색 링으로 떼어낸다.
        itemStyle: { borderColor: t.surface, borderWidth: 2 },
        emphasis: { focus: 'series' as const },
      })),
    }
  }, [data, colors, theme, unit, labelRotate, valueFormat])

  return <EChart option={option} height={height} />
}
