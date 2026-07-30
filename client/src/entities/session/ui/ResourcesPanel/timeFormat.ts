/** ResourcesPanel 의 호출 시각 표시 헬퍼(순수). GroupCard·TimelineRow 가 공유한다. */

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function fmtTimeRange(from: string, to: string): string {
  if (from === to) return fmtTime(from)
  const f = new Date(from)
  const t = new Date(to)
  const durMs = t.getTime() - f.getTime()
  if (durMs < 60_000) return `${fmtTime(from)} · ${(durMs / 1000).toFixed(0)}s`
  const min = Math.floor(durMs / 60_000)
  return `${fmtTime(from)} · ${min}분`
}
