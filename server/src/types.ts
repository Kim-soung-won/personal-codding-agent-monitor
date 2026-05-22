export type EventCategory =
  | 'user-input'
  | 'thinking'
  | 'tool-use'
  | 'assistant-text'
  | 'context-injection'
  | 'file-edit'
  | 'system'
  | 'unknown'

export interface NormalizedEvent {
  id: string
  sessionId: string
  timestamp: string
  category: EventCategory
  raw: unknown
  summary: string
}

export interface SessionInfo {
  projectPath: string
  projectEncoded: string
  sessionId: string
  filePath: string
  lastModified: number
}
