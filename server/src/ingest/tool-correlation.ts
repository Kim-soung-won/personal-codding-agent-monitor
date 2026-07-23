import {
  extractToolCalls,
  extractToolResults,
  type EventLike,
} from '../../../shared/resource-extract.js'

export interface ToolOutcome {
  isError: number | null // 0/1/null
  interrupted: number | null // 0/1/null
  durationMs: number | null
}

/**
 * tool_use 호출과 후속 tool_result 를 tool_use_id 로 상관시켜 결과 신호를 만든다.
 *
 * 실측: tool_result 블록에 is_error 가 직접 있어 휴리스틱이 필요 없다.
 * duration 은 호출 이벤트 ↔ 결과 이벤트 타임스탬프 델타. 매칭 실패 시 해당 키는 없음(집계 왜곡 방지).
 * interrupted 는 tool_result 블록에 없어 현재 null(향후 top-level toolUseResult 로 보강 여지).
 */
export function correlateToolOutcomes(events: EventLike[]): Map<string, ToolOutcome> {
  const callTs = new Map<string, string>()
  for (const c of extractToolCalls(events)) callTs.set(c.id, c.timestamp)

  const out = new Map<string, ToolOutcome>()
  for (const r of extractToolResults(events)) {
    const ct = callTs.get(r.toolUseId)
    let durationMs: number | null = null
    if (ct) {
      const d = new Date(r.timestamp).getTime() - new Date(ct).getTime()
      if (Number.isFinite(d) && d >= 0) durationMs = d
    }
    out.set(r.toolUseId, {
      isError: r.isError === null ? null : r.isError ? 1 : 0,
      interrupted: null,
      durationMs,
    })
  }
  return out
}
