import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { PageShell } from "@/shared/ui/PageShell";
import { StatCard } from "@/shared/ui/StatCard";
import { Prose } from "@/shared/ui/Prose";
import { CacheReuseCard, commitRecordQueries } from "@/entities/commit-record";
import { cn } from "@/shared/lib/utils";
import {
  compactTokens,
  contextReuseRate,
  estimateCostUsd,
  fmtUsd,
} from "@/shared/lib/format";
import {
  AXIS_LABEL,
  type FeedbackVerdict,
} from "@/entities/commit-record";
import { InvocationCell } from "@/pages/commit-record-detail/components/InvocationCell";
import { SessionHygieneSection } from "@/pages/commit-record-detail/components/SessionHygieneSection";
import { SubAgentsSection } from "@/pages/commit-record-detail/components/SubAgentsSection";

const VERDICT_STYLE: Record<FeedbackVerdict, string> = {
  GOOD: "bg-success/10 text-success",
  CONCERN: "bg-warning/10 text-warning",
  INSUFFICIENT_EVIDENCE: "bg-muted text-muted-foreground",
};

const VERDICT_LABEL: Record<FeedbackVerdict, string> = {
  GOOD: "양호",
  CONCERN: "주의",
  INSUFFICIENT_EVIDENCE: "근거 부족",
};

export function CommitRecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showRaw, setShowRaw] = useState(false);
  const { data: record, isPending: loading } = useQuery({
    ...commitRecordQueries.record(id ?? ""),
    enabled: !!id,
  });

  if (loading) {
    return (
      <PageShell title="커밋 기록">
        <p className="text-sm text-muted-foreground py-16 text-center">
          불러오는 중…
        </p>
      </PageShell>
    );
  }

  if (!record) {
    return (
      <PageShell title="커밋 기록">
        <p className="text-sm text-muted-foreground py-16 text-center">
          기록을 찾을 수 없습니다.{" "}
          <Link to="/" className="text-primary underline">
            목록으로
          </Link>
        </p>
      </PageShell>
    );
  }

  const confirmedSignals = record.signals.filter(
    (s) => s.verdict === "CONFIRMED",
  );
  const falsePositives = record.signals.filter(
    (s) => s.verdict === "FALSE_POSITIVE",
  );

  return (
    <PageShell
      title={record.commitSubject ?? record.commitSha.slice(0, 7)}
      subtitle={`${record.commitSha.slice(0, 7)}${record.revision > 1 ? ` · r${record.revision}` : ""} · ${record.project.name} · ${record.capturedAt.slice(0, 10)}`}
      actions={
        // 로컬 파일 모드에서 이 커밋을 만든 세션의 실제 대화 턴으로 바로 이동한다.
        <Link
          to={`/s/${record.sessionId}/chat`}
          className="inline-flex items-center gap-1.5 h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
          title="이 커밋을 만든 세션의 대화 턴 보기"
        >
          💬 세션 대화 보기
        </Link>
      }
    >
      <div className="mb-4">
        <Link to="/" className="text-xs text-primary hover:underline">
          ← 커밋 기록 목록
        </Link>
      </div>

      {(() => {
        // 상단 카드: 절대 토큰 수 대신 사람이 바로 해석할 수 있는 지표로 환산한다.
        const costUsd = estimateCostUsd({
          input: record.inputTokens,
          output: record.outputTokens,
          cacheWrite: record.cacheCreationTokens,
          cacheRead: record.cacheReadTokens,
        });
        // 총 컨텍스트 크기 = 이 커밋 델타에서 오간 전체 토큰(입력+출력+캐시 쓰기/읽기).
        const totalContext =
          record.inputTokens +
          record.outputTokens +
          record.cacheCreationTokens +
          record.cacheReadTokens;
        const reuse = contextReuseRate(
          record.cacheReadTokens,
          record.cacheCreationTokens,
        );
        // 재사용이 높을수록 컨텍스트를 다시 짓지 않고 아꼈다는 뜻 → 낮으면 주의.
        const reuseTone =
          reuse == null ? "default" : reuse >= 60 ? "good" : reuse < 30 ? "warn" : "default";
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard
              label="예상 비용"
              value={fmtUsd(costUsd)}
              sub="이 커밋에 든 토큰 비용 (공개 단가 추정)"
            />
            <StatCard
              label="총 컨텍스트 크기"
              value={`${compactTokens(totalContext)} tok`}
              sub="이 커밋에서 오간 전체 토큰 (입력+출력+캐시)"
            />
            <StatCard
              label="컨텍스트 재사용률"
              value={reuse == null ? "산출 불가" : `${reuse.toFixed(0)}%`}
              sub="높을수록 맥락을 다시 안 짓고 아껴 씀"
              tone={reuseTone}
            />
            <StatCard
              label="이벤트"
              value={record.eventCount.toLocaleString()}
              sub="직전 커밋 이후 오간 턴·도구 수"
            />
          </div>
        );
      })()}

      {/* 신호 — rubric 1단계가 최상단이라 여기서도 먼저 보여준다 */}
      <section className="rounded-xl border border-border bg-card p-4 mb-4">
        <h2 className="text-base font-semibold mb-3">신호</h2>
        {confirmedSignals.length === 0 && falsePositives.length === 0 ? (
          <p className="text-xs text-muted-foreground">감정 신호 없음</p>
        ) : (
          <div className="space-y-2">
            {confirmedSignals.map((s, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs",
                  s.polarity === "NEGATIVE"
                    ? "bg-destructive/5 border border-destructive/20"
                    : "bg-success/5 border border-success/20",
                )}
              >
                <p className="font-medium mb-1">
                  {s.polarity === "NEGATIVE" ? "🔴 부정" : "🟢 긍정"}
                  {s.confirmedCount != null && ` · 실질 ${s.confirmedCount}건`}
                  {s.turnRef && ` · ${s.turnRef}`}
                </p>
                {s.excerpt && (
                  <p className="font-mono text-2xs mb-1">"{s.excerpt}"</p>
                )}
                {s.note && (
                  <p className="text-muted-foreground leading-relaxed">
                    {s.note}
                  </p>
                )}
              </div>
            ))}
            {falsePositives.map((s, i) => (
              <p key={`fp-${i}`} className="text-2xs text-muted-foreground">
                {s.polarity === "NEGATIVE" ? "부정" : "긍정"} 플래그는
                재판정에서 전부 오탐으로 걸러짐
                {s.flaggedCount != null && ` (${s.flaggedCount}건)`}
              </p>
            ))}
          </div>
        )}
      </section>

      {record.summary && (
        <section className="rounded-xl border border-border bg-card p-4 mb-4">
          <h2 className="text-base font-semibold mb-2">요약</h2>
          <Prose>{record.summary}</Prose>
        </section>
      )}

      {record.costNote && (
        <section className="rounded-xl border border-border bg-card p-4 mb-4">
          <h2 className="text-base font-semibold mb-2">비용 메모</h2>
          <Prose>{record.costNote}</Prose>
        </section>
      )}

      {record.feedback.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4 mb-4">
          <h2 className="text-base font-semibold mb-3">피드백</h2>
          <div className="space-y-4">
            {record.feedback.map((f) => (
              <div key={f.id}>
                <p className="text-sm font-medium mb-1.5 flex items-center gap-2">
                  {AXIS_LABEL[f.axis]}
                  {f.verdict && (
                    <span
                      className={cn(
                        "text-2xs px-1.5 py-0.5 rounded",
                        VERDICT_STYLE[f.verdict],
                      )}
                    >
                      {VERDICT_LABEL[f.verdict]}
                    </span>
                  )}
                </p>
                <Prose>{f.body}</Prose>
              </div>
            ))}
          </div>
        </section>
      )}

      {record.agents.length > 0 && <SubAgentsSection agents={record.agents} />}

      {record.invocations.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4 mb-4">
          <h2 className="text-base font-semibold mb-3">에이전트·도구 사용 내역</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-2xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="text-left font-medium py-1.5 pr-3 w-10">#</th>
                  <th className="text-left font-medium py-1.5 pr-3">주체</th>
                  <th className="text-left font-medium py-1.5 pr-3">
                    도구·에이전트
                  </th>
                  <th className="text-left font-medium py-1.5 pr-3">대상</th>
                  <th className="text-left font-medium py-1.5">비고</th>
                </tr>
              </thead>
              <tbody>
                {record.invocations.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-1.5 pr-3 text-muted-foreground tabular-nums">
                      {row.seq ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-2xs">
                      {row.actor}
                    </td>
                    <td className="py-1.5 pr-3">
                      <InvocationCell row={row} />
                    </td>
                    {/* 긴 Bash 명령이 행을 늘리지 않게 한 줄로 자른다 — 전문은 title 로 */}
                    <td className="py-1.5 pr-3 text-muted-foreground max-w-xs">
                      <span className="block truncate" title={row.target ?? undefined}>
                        {row.target ?? "—"}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "py-1.5 text-2xs",
                        row.isError
                          ? "text-destructive font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      {row.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {record.sessionHygiene && (
        <CacheReuseCard h={record.sessionHygiene} />
      )}

      {record.sessionHygiene && (
        <SessionHygieneSection h={record.sessionHygiene} />
      )}

      {/* 파싱이 놓친 뉘앙스는 원문으로 확인한다 — 원본을 항상 보관하는 이유 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <button
          className="text-xs text-primary hover:underline"
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? "원문 접기" : "원문 보기 (.md)"}
        </button>
        {showRaw && (
          <pre className="mt-3 text-2xs bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
            {record.rawMarkdown}
          </pre>
        )}
      </section>
    </PageShell>
  );
}
