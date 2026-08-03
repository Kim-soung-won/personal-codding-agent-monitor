import { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { BarChart as BarSeries, LineChart as LineSeries, PieChart as PieSeries } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

// 전체 echarts 번들(~1MB) 대신 실제로 쓰는 시리즈·컴포넌트만 등록한다.
// 새 차트 종류를 추가하면 여기에도 등록해야 한다 — 빠뜨리면 런타임에 빈 캔버스가 나온다.
echarts.use([
  BarSeries,
  LineSeries,
  PieSeries,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
])

interface Props {
  option: EChartsOption
  /** CSS 높이. 기본 260px */
  height?: string
}

/**
 * echarts 를 감싸는 최소 래퍼. 개별 차트 컴포넌트가 option 을 만들어 넘긴다.
 *
 * `notMerge` 를 켜두는 이유: 시리즈 개수가 줄어드는 갱신(필터로 시리즈가 빠지는 경우)에서
 * 병합 모드는 이전 시리즈를 남긴다.
 */
export function EChart({ option, height = '260px' }: Props) {
  const style = useMemo(() => ({ height, width: '100%' }), [height])

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={style}
      notMerge
      lazyUpdate
      opts={{ renderer: 'canvas' }}
    />
  )
}
