export type EventCategory =
  | 'user-input'
  | 'thinking'
  | 'tool-use'
  | 'assistant-text'
  | 'context-injection'
  | 'file-edit'
  | 'system'
  | 'unknown'

/** 이벤트가 메인 세션 파일에서 왔는지, 서브에이전트 파일에서 왔는지 */
export type EventOrigin = 'main' | 'subagent'

export interface NormalizedEvent {
  id: string
  sessionId: string
  timestamp: string
  category: EventCategory
  raw: unknown
  summary: string
  origin: EventOrigin
  agentId?: string
}

export interface SessionInfo {
  projectPath: string
  projectEncoded: string
  sessionId: string
  filePath: string
  lastModified: number
  /** {session-uuid}/subagents/*.jsonl 절대경로. 없으면 빈 배열 */
  subagentFilePaths: string[]
}
