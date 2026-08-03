import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { EChart } from '../EChart'
import { categoryAxisOption, legendOption, tooltipOption, valueAxisOption } from '../chartTheme'
import type { BarChartView, ChartTheme } from '../types'

interface Props {
  data: BarChartView
  /** 시리즈 순서대로 적용할 hex 색. 시리즈보다 짧으면 echarts 기본색으로 넘어간다 */
  colors?: string[]
  height?: string
  theme?: ChartTheme
  /** 값 축·툴팁에 붙는 단위(예: '회') */
  unit?: string
  /** 카테고리 라벨 회전 각도. 라벨이 길고 많을 때만 준다 */
  labelRotate?: number
}

/** 카테고리별 세로 막대. 시리즈가 여럿이면 나란히(grouped) 놓고 범례를 띄운다. */
export function BarChart({ data, colors, height, theme = 'light', unit, labelRotate = 0 }: Props) {
  const option = useMemo<EChartsOption>(() => {
    const multi = data.series.length > 1

    return {
      color: colors,
      // containLabel 이 회전 라벨 높이를 먹으므로 범례 자리(하단)만 따로 비운다.
      grid: { left: 8, right: 12, top: 12, bottom: multi ? 28 : 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...tooltipOption(theme),
        valueFormatter: unit ? (v) => `${v}${unit}` : undefined,
      },
      legend: legendOption(theme, multi),
      xAxis: { ...categoryAxisOption(theme, labelRotate), data: data.categories },
      yAxis: valueAxisOption(theme, unit),
      series: data.series.map((s) => ({
        type: 'bar' as const,
        name: s.name,
        data: s.data,
        // 막대는 가늘게, 값 쪽 끝만 둥글게 — 바닥은 기준선에 붙인다.
        barMaxWidth: 28,
        barGap: '12%',
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      })),
    }
  }, [data, colors, theme, unit, labelRotate])

  return <EChart option={option} height={height} />
}
