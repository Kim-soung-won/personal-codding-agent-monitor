/**
 * DB(ToolInvocation.kind)의 종류 축 — AGENT·SKILL·MCP·TOOL + 미분류.
 *
 * 로컬 JSONL 화면이 쓰는 5종(KIND_HEX: skill/agent/workflow/artifact/mcp)과 다르다.
 * 커밋 기록 파서는 workflow·artifact 를 따로 분류하지 않으므로 그 둘은 여기 없다.
 *
 * TOOL(내장 Bash·Edit·Read…)과 미분류는 정체성이 아니라 "나머지" 버킷이라 중립 회색을
 * 준다 — 색을 하나 더 태우면 정작 구분해야 할 AGENT·SKILL·MCP 가 묻힌다.
 * 유채색 3종은 라이트/다크 각각 색각 이상 인접쌍 분리도 검증을 통과한 조합이다
 * (라이트 magenta 는 표면 대비가 3:1 아래라 범례 라벨이 항상 보여야 한다).
 */
import type { InvocationKind } from '@/entities/commit-record'

export interface InvocationKindStyle {
  label: string
  light: string
  dark: string
}

/** kind 가 null 인 호출(파서가 종류를 못 정한 행)의 키. */
export const UNCLASSIFIED = 'UNCLASSIFIED' as const

export type InvocationKindKey = InvocationKind | typeof UNCLASSIFIED

export const INVOCATION_KIND_ORDER: InvocationKindKey[] = [
  'AGENT',
  'SKILL',
  'MCP',
  'TOOL',
  UNCLASSIFIED,
]

export const INVOCATION_KIND_STYLE: Record<InvocationKindKey, InvocationKindStyle> = {
  AGENT: { label: 'Agent', light: '#4a3aa7', dark: '#9085e9' },
  SKILL: { label: 'Skill', light: '#e87ba4', dark: '#d55181' },
  MCP: { label: 'MCP', light: '#008300', dark: '#008300' },
  TOOL: { label: '내장 도구', light: '#898781', dark: '#898781' },
  [UNCLASSIFIED]: { label: '미분류', light: '#c3c2b7', dark: '#52514e' },
}

/** 서버가 내려주는 kind(null 포함)를 색·라벨 키로 바꾼다. */
export function kindKey(kind: InvocationKind | null): InvocationKindKey {
  return kind ?? UNCLASSIFIED
}
