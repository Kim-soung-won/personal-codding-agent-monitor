import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { EChart } from '../EChart'
import { chartTokens, legendOption, tooltipOption } from '../chartTheme'
import type { CategoryDoughnutChartView, ChartTheme } from '../types'

interface Props {
  data: CategoryDoughnutChartView
  /** 카테고리 순서대로 적용할 hex 색 */
  colors?: string[]
  height?: string
  theme?: ChartTheme
}

/** 구성비 도넛. 조각 사이를 표면색으로 2px 벌려 인접 색이 붙어 보이지 않게 한다. */
export function DoughnutChart({ data, colors, height, theme = 'light' }: Props) {
  const option = useMemo<EChartsOption>(() => {
    const t = chartTokens(theme)
    const total = data.reduce((sum, d) => sum + d.value, 0)

    return {
      color: colors,
      tooltip: {
        trigger: 'item',
        ...tooltipOption(theme),
        formatter: (p: unknown) => {
          const { name, value } = p as { name: string; value: number }
          const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
          return `${name} <b>${value}</b> (${pct}%)`
        },
      },
      legend: legendOption(theme, data.length > 1),
      series: [
        {
          type: 'pie' as const,
          radius: ['55%', '78%'],
          center: ['50%', '45%'],
          data,
          // 조각 위 라벨은 겹치기 쉬워 끈다. 정체성은 범례 + 호버가 나른다.
          label: { show: false },
          labelLine: { show: false },
          itemStyle: { borderColor: t.surface, borderWidth: 2 },
          emphasis: { scale: true, scaleSize: 4 },
        },
      ],
    }
  }, [data, colors, theme])

  return <EChart option={option} height={height} />
}
