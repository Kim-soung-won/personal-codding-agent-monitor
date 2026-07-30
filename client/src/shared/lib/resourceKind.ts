/**
 * 리소스 종류(skill/agent/workflow/artifact/mcp)의 색·라벨 단일 소스.
 * 차트(hex)와 뱃지/도트/바(tailwind 클래스) 표현을 함께 제공한다.
 * (기존 GlobalAnalytics.KIND_COLORS + ResourcesPanel.KIND_STYLES 통합)
 */

export const RESOURCE_KINDS = ['skill', 'agent', 'workflow', 'artifact', 'mcp'] as const
export type ResourceKind = (typeof RESOURCE_KINDS)[number]

/** echarts 등 차트용 hex 색상. */
export const KIND_HEX: Record<ResourceKind, string> = {
  skill: '#8b5cf6',
  agent: '#f59e0b',
  workflow: '#10b981',
  artifact: '#06b6d4',
  mcp: '#f43f5e',
}

export const KIND_LABEL: Record<ResourceKind, string> = {
  skill: 'Skill',
  agent: 'Agent',
  workflow: 'Workflow',
  artifact: 'Artifact',
  mcp: 'MCP',
}

export interface KindStyle {
  dot: string
  badge: string
  bar: string
  label: string
}

/** 뱃지/도트/바 tailwind 클래스(뷰 공용). */
export const KIND_STYLES: Record<ResourceKind, KindStyle> = {
  skill: {
    dot: 'bg-violet-500',
    badge: 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
    bar: 'bg-violet-400',
    label: 'Skill',
  },
  agent: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    bar: 'bg-amber-400',
    label: 'Agent',
  },
  workflow: {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    bar: 'bg-emerald-400',
    label: 'Workflow',
  },
  artifact: {
    dot: 'bg-cyan-500',
    badge: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
    bar: 'bg-cyan-400',
    label: 'Artifact',
  },
  mcp: {
    dot: 'bg-rose-500',
    badge: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
    bar: 'bg-rose-400',
    label: 'MCP',
  },
}

/** 알 수 없는 kind 문자열에 대한 안전한 조회. */
export function kindStyle(kind: string): KindStyle {
  return (KIND_STYLES as Record<string, KindStyle>)[kind] ?? {
    dot: 'bg-muted-foreground',
    badge: 'bg-muted text-muted-foreground border border-border',
    bar: 'bg-muted-foreground',
    label: kind,
  }
}
