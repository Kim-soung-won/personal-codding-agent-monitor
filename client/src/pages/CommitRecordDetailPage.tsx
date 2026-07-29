import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageShell } from "../components/ui/PageShell";
import { StatCard } from "../components/ui/StatCard";
import { Prose } from "../components/ui/Prose";
import { CacheReuseCard } from "../components/ui/CacheReuseCard";
import { cn } from "../lib/utils";
import {
  compactTokens,
  contextReuseRate,
  estimateCostUsd,
  fmtUsd,
} from "../lib/format";
import * as api from "../lib/agentFactoryApi";
import {
  AXIS_LABEL,
  type CommitRecordDetail,
  type FeedbackVerdict,
  type InvocationRow,
  type RecordAgentRow,
  type SessionHygiene,
  type ToolResultSpike,
} from "../types/agentFactory";

// 안티패턴 경고 임계치. 커밋 델타 규모에 맞춘 경험값 — 넘으면 주의로 표시한다.
const SLOPE_WARN = 40000;
const JUMP_WARN = 100000;
const CR_RATIO_WARN = 50;

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

const KIND_STYLE: Record<string, string> = {
  AGENT: "bg-primary/10 text-primary",
  SKILL: "bg-info/10 text-info",
  MCP: "bg-accent/10 text-accent",
  TOOL: "bg-muted text-muted-foreground",
};

function InvocationCell({ row }: { row: InvocationRow }) {
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

/** null 은 "산출 불가"(0 과 구별). 그 외엔 천단위 구분 + 접미사. */
function fmtHyg(n: number | null, suffix = ""): string {
  if (n == null) return "산출 불가";
  return n.toLocaleString() + suffix;
}

// 글자수→토큰 대략 환산(영문·코드 기준 경험값). 정밀치가 아니라 체감 규모용이라 "약"으로 표기한다.
const CHARS_PER_TOKEN = 4;

/** 글자수를 대략 토큰 수로 환산한다(체감용 근사). */
function approxTokens(chars: number): number {
  return Math.round(chars / CHARS_PER_TOKEN);
}

/** 세션 위생(COST 축) — 컨텍스트 누적·재청구 안티패턴 신호. */
function SessionHygieneSection({ h }: { h: SessionHygiene }) {
  // 가장 강한 신호: 리셋 없이 컨텍스트가 단조 누적(기울기 큼 + 리셋 0).
  const monotonicCreep =
    h.contextSlope != null &&
    h.contextSlope >= SLOPE_WARN &&
    h.sessionResets === 0;
  const bigTurnJump =
    h.maxTurnContextJump != null && h.maxTurnContextJump >= JUMP_WARN;
  const highReclaimTax = h.crGenRatio != null && h.crGenRatio >= CR_RATIO_WARN;

  const spikes: ToolResultSpike[] = Array.isArray(h.toolResultSpikes)
    ? h.toolResultSpikes
    : [];
  // 정렬·막대 기준은 "재청구 추정 비용". rebilled_tokens 가 있으면 그것을, 없으면(구버전)
  // 일회성 크기의 토큰 근사로 폴백한다.
  const costOf = (s: ToolResultSpike): number =>
    s.rebilled_tokens != null ? s.rebilled_tokens : approxTokens(s.len);
  const sortedSpikes = [...spikes].sort((a, b) => costOf(b) - costOf(a));
  const maxCost = sortedSpikes.length > 0 ? costOf(sortedSpikes[0]) : 0;

  return (
    <section className="rounded-xl border border-border bg-card p-4 mb-4">
      <h2 className="text-base font-semibold mb-1">세션 위생</h2>
      <p className="text-2xs text-muted-foreground mb-3">
        비용(COST) 축 — 컨텍스트가 리셋 없이 쌓이거나 재청구되는 안티패턴 신호
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <StatCard
          label="context 기울기"
          value={fmtHyg(h.contextSlope)}
          sub="커밋마다 붙는 평균 토큰 · 클수록 세션이 무거워짐"
          tone={monotonicCreep ? "bad" : "default"}
        />
        <StatCard
          label="세션 리셋"
          value={fmtHyg(h.sessionResets)}
          sub="compact/clear 로 끊은 횟수 · 0이면 한 번도 안 정리"
          tone={h.sessionResets === 0 && monotonicCreep ? "warn" : "default"}
        />
        <StatCard
          label="턴 급증폭"
          value={fmtHyg(h.maxTurnContextJump)}
          sub="한 턴에서 가장 크게 뛴 폭 · 대용량 덤프 신호"
          tone={bigTurnJump ? "warn" : "default"}
        />
        <StatCard
          label="재청구 비율"
          value={
            h.crGenRatio == null ? "산출 불가" : `${h.crGenRatio.toFixed(1)}%`
          }
          sub="매 턴 새로 써넣은 컨텍스트 비율 · 세션 길이와 함께 볼 것"
          tone={highReclaimTax ? "warn" : "default"}
        />
      </div>

      <div className="space-y-2">
        {monotonicCreep && (
          <div className="rounded-lg px-3 py-2 text-xs bg-destructive/5 border border-destructive/20">
            <p className="font-medium">🔴 리셋 없이 컨텍스트 단조 누적</p>
            <p className="text-muted-foreground leading-relaxed">
              기울기 {fmtHyg(h.contextSlope)}/커밋인데 세션 리셋이 0회 — 가장
              강한 위생 경고. 중간에 compact/clear 로 컨텍스트를 끊어줄 지점을
              검토하세요.
            </p>
          </div>
        )}
        {bigTurnJump && (
          <div className="rounded-lg px-3 py-2 text-xs bg-warning/5 border border-warning/20">
            <p className="font-medium">🟡 단일 턴 대용량 덤프</p>
            <p className="text-muted-foreground leading-relaxed">
              한 턴에서 컨텍스트가 {fmtHyg(h.maxTurnContextJump)} 토큰 급증 —
              대용량 read 등이 컨텍스트로 끌려들어온 신호.
            </p>
          </div>
        )}
        {highReclaimTax && (
          <div className="rounded-lg px-3 py-2 text-xs bg-warning/5 border border-warning/20">
            <p className="font-medium">🟡 재청구 컨텍스트 세(稅) 과반</p>
            <p className="text-muted-foreground leading-relaxed">
              재청구 비율 {h.crGenRatio?.toFixed(1)}% (샘플{" "}
              {fmtHyg(h.contextSamples)}건 기준). 비율 자체는 병이 아니며 세션
              길이와 함께 봐야 합니다.
            </p>
          </div>
        )}
        {sortedSpikes.length > 0 && (
          <div className="rounded-lg px-3 py-2 text-xs bg-muted/40 border border-border">
            <p className="font-medium">재청구 비용이 큰 도구 결과</p>
            <p className="text-2xs text-muted-foreground mb-2">
              큰 도구 결과(파일 읽기·명령 출력 등)는 컨텍스트에 남아{" "}
              <b className="font-medium text-foreground">
                이후 턴마다 다시 청구된다
              </b>
              . 그래서 세션 초반에 생겨 오래 얹힌 결과가, 크지만 세션 끝에 생긴
              결과보다 비싸다. 아래는 그 재청구 추정 비용(크기 × 잔류 턴)이 큰
              순서다 — 막대가 그 비용, 오른쪽은 잔류 턴과 크기.
            </p>
            {/* 열 의미를 머리글로 못박는다 — 막대·숫자가 무엇인지 오해를 줄인다 */}
            <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
              <span className="flex-1">재청구 추정 비용 (최댓값 = 100%)</span>
              <span className="shrink-0">잔류 · 크기</span>
            </div>
            <ul className="space-y-1.5">
              {sortedSpikes.map((s, i) => {
                const pct = maxCost > 0 ? Math.round((costOf(s) / maxCost) * 100) : 0;
                // rebilled_tokens 가 오면 재청구 비용을, 없으면(구버전) 크기만 폴백 표기.
                const hasRebill = s.rebilled_tokens != null;
                return (
                  <li key={i} className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-warning/60"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-2xs tabular-nums">
                      {hasRebill ? (
                        <>
                          약 {s.rebilled_tokens!.toLocaleString()}토큰 재청구{" "}
                          <span className="text-muted-foreground">
                            · {s.turns_resident ?? 0}턴 잔류 · {s.len.toLocaleString()}자
                          </span>
                        </>
                      ) : (
                        <>
                          {s.len.toLocaleString()}자{" "}
                          <span className="text-muted-foreground">
                            · 약 {approxTokens(s.len).toLocaleString()}토큰
                          </span>
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5 text-[10px] text-muted-foreground/70">
              재청구 비용은 추정치다: 글자÷4 토큰 환산 × 잔류 턴이며, 델타 내부의
              compact/clear 는 반영하지 않는다.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/** 한 서브에이전트의 계량치 한 줄 지표. */
function AgentMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "bad";
}) {
  return (
    <div className="flex flex-col">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "bad" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * 서브에이전트 사용 상세 — 이 커밋 델타에서 부른 에이전트별 계량치.
 * 도구 사용 표(Agent 호출이 TOOL 로 묻힘)와 달리, "이 에이전트가 값을 했나"를
 * spawn·토큰·비용·도구·오류로 드러낸다.
 */
function SubAgentsSection({ agents }: { agents: RecordAgentRow[] }) {
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

export function CommitRecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<CommitRecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getRecord(id)
      .then(setRecord)
      .finally(() => setLoading(false));
  }, [id]);

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
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      {row.target ?? "—"}
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
