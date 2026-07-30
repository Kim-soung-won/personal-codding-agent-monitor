import { cn } from "@/shared/lib/utils";
import { type InvocationRow } from "@/entities/commit-record";
import { KIND_STYLE } from "@/pages/commit-record-detail/kindStyle";

export function InvocationCell({ row }: { row: InvocationRow }) {
  if (row.rowType === "AGGREGATE") {
    return (
      <span className="font-mono text-2xs text-muted-foreground">
        {row.resource}
      </span>
    );
  }
  // 내장 Agent 도구 호출은 kind 가 TOOL 로 잡혀 서브에이전트가 표에서 묻힌다 —
  // resource 가 Agent 면 AGENT 로 승격해 눈에 띄게 한다.
  const isSpawn = row.resource === "Agent";
  const badgeKind = isSpawn ? "AGENT" : row.kind;
  return (
    <span className="flex items-center gap-1.5">
      {badgeKind && (
        <span
          className={cn(
            "text-2xs px-1.5 py-0.5 rounded font-semibold",
            KIND_STYLE[badgeKind] ?? KIND_STYLE.TOOL,
          )}
        >
          {badgeKind}
        </span>
      )}
      <span className="font-mono text-xs">{row.resource}</span>
    </span>
  );
}
