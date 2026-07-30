import { cn } from "@/shared/lib/utils";
import { compactTokens, estimateCostUsd, fmtUsd } from "@/shared/lib/format";
import { type RecordAgentRow } from "@/entities/commit-record";
import { KIND_STYLE } from "@/pages/commit-record-detail/kindStyle";
import { AgentMetric } from "@/pages/commit-record-detail/components/AgentMetric";

/**
 * 서브에이전트 사용 상세 — 이 커밋 델타에서 부른 에이전트별 계량치.
 * 도구 사용 표(Agent 호출이 TOOL 로 묻힘)와 달리, "이 에이전트가 값을 했나"를
 * spawn·토큰·비용·도구·오류로 드러낸다.
 */
export function SubAgentsSection({ agents }: { agents: RecordAgentRow[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 mb-4">
      <h2 className="text-base font-semibold mb-1">서브에이전트</h2>
      <p className="text-2xs text-muted-foreground mb-3">
        이 커밋 델타에서 호출한 에이전트와 그 실행 계량치 — 위임이 값을 했는지 본다
      </p>
      <div className="space-y-3">
        {agents.map((a, i) => {
          const name = a.plugin ? `${a.plugin}:${a.agent}` : a.agent;
          const output = a.outputTokens ?? 0;
          const cacheRead = a.cacheReadTokens ?? 0;
          const cacheWrite = a.cacheCreationTokens ?? 0;
          const input = a.inputTokens ?? 0;
          // 서브에이전트도 컨텍스트를 소비한다 — 같은 단가로 위임 비용을 환산한다.
          const cost = estimateCostUsd({
            input,
            output,
            cacheWrite,
            cacheRead,
          });
          const hasMetrics =
            a.outputTokens != null || a.toolCalls != null || a.inputTokens != null;
          const errors = a.errors ?? 0;
          return (
            <div
              key={i}
              className="rounded-lg border border-border bg-background/40 px-3 py-2.5"
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span
                  className={cn(
                    "text-2xs px-1.5 py-0.5 rounded font-semibold",
                    KIND_STYLE.AGENT,
                  )}
                >
                  AGENT
                </span>
                <span className="font-mono text-xs font-medium">{name}</span>
                <span className="text-2xs text-muted-foreground">
                  ×{a.spawnCount}회 호출
                </span>
              </div>
              {hasMetrics ? (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  <AgentMetric label="예상 비용" value={fmtUsd(cost)} />
                  <AgentMetric
                    label="모델 출력량"
                    value={`${compactTokens(output)} tok`}
                  />
                  <AgentMetric label="도구 호출" value={String(a.toolCalls ?? 0)} />
                  <AgentMetric
                    label="오류"
                    value={String(errors)}
                    tone={errors > 0 ? "bad" : "default"}
                  />
                  <AgentMetric
                    label="컨텍스트"
                    value={compactTokens(cacheRead + cacheWrite)}
                  />
                </div>
              ) : (
                <p className="text-2xs text-muted-foreground">
                  계량치 없음(구버전 기록) — spawn 횟수만 집계됨
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
