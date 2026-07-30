import type { TurnUsage } from '@/entities/session/model/groupChatTurns'

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function UsageLine({ usage }: { usage: TurnUsage }) {
  const hasData = usage.outputTokens > 0 || usage.cacheRead > 0 || usage.estimatedCostUsd > 0
  if (!hasData) return null

  const costStr = usage.estimatedCostUsd < 0.00005
    ? '<$0.01'
    : `$${usage.estimatedCostUsd.toFixed(4)}`

  return (
    <div className="flex items-center gap-2 flex-wrap mt-1">
      {/* Cost chip */}
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-mono font-medium">
        {costStr}
      </span>
      {/* Token chips */}
      {usage.outputTokens > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          {fmt(usage.outputTokens)} out
        </span>
      )}
      {usage.cacheRead > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z" />
            <path strokeLinecap="round" d="M9 11h6m-6 4h4" />
          </svg>
          {fmt(usage.cacheRead)} cached
        </span>
      )}
      {usage.cacheWrite > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground opacity-70">
          {fmt(usage.cacheWrite)} wrote
        </span>
      )}
    </div>
  )
}
