import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageShell } from "../components/ui/PageShell";
import { StatCard } from "../components/ui/StatCard";
import { cn } from "../lib/utils";
import * as api from "../lib/agentFactoryApi";
import {
  AXIS_LABEL,
  type CommitRecordDetail,
  type FeedbackVerdict,
  type InvocationRow,
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
  return (
    <span className="flex items-center gap-1.5">
      {row.kind && (
        <span
          className={cn(
            "text-2xs px-1.5 py-0.5 rounded font-semibold",
            KIND_STYLE[row.kind] ?? KIND_STYLE.TOOL,
          )}
        >
          {row.kind}
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
      <h2 className="text-sm font-medium mb-1">세션 위생</h2>
      <p className="text-2xs text-muted-foreground mb-3">
        비용(COST) 축 — 컨텍스트가 리셋 없이 쌓이거나 재청구되는 안티패턴 신호
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <StatCard
          label="context 기울기"
          value={fmtHyg(h.contextSlope)}
          sub={`커밋당 증가 · 샘플 ${fmtHyg(h.contextSamples)}`}
          tone={monotonicCreep ? "bad" : "default"}
          hint="커밋을 하나 만들 때마다 대화 컨텍스트가 평균 몇 토큰씩 불어나는지. 값이 클수록 세션이 무거워져 비용과 응답 지연이 함께 커진다. 중간에 컨텍스트를 정리하지 않으면 계속 쌓인다."
        />
        <StatCard
          label="세션 리셋"
          value={fmtHyg(h.sessionResets)}
          sub="compact/clear 누적"
          tone={h.sessionResets === 0 && monotonicCreep ? "warn" : "default"}
          hint="이 세션에서 /compact·/clear 로 컨텍스트를 끊어낸 누적 횟수. 0이면 세션 내내 한 번도 정리하지 않았다는 뜻이다. 기울기가 큰데 이 값이 0이면 가장 강한 경고다."
        />
        <StatCard
          label="턴 급증폭"
          value={fmtHyg(h.maxTurnContextJump)}
          sub="단일 턴 최대 증가"
          tone={bigTurnJump ? "warn" : "default"}
          hint="한 번의 턴에서 컨텍스트가 가장 크게 뛴 폭. 대용량 파일 읽기나 긴 도구 결과 하나가 이후 모든 턴에 얹혀 반복 청구되는 신호다. 클수록 그 덤프의 뒷비용이 크다."
        />
        <StatCard
          label="재청구 비율"
          value={
            h.crGenRatio == null ? "산출 불가" : `${h.crGenRatio.toFixed(1)}%`
          }
          sub="cache write / read"
          tone={highReclaimTax ? "warn" : "default"}
          hint="재사용된 컨텍스트(cache read) 대비 매 턴 새로 캐시에 써넣은 컨텍스트(cache write)의 비율. 높을수록 컨텍스트를 다시 만들어 청구되는 몫이 크다. 다만 세션 길이와 함께 봐야 하며 비율 자체가 병은 아니다."
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
    >
      <div className="mb-4">
        <Link to="/" className="text-xs text-primary hover:underline">
          ← 커밋 기록 목록
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="이벤트"
          value={record.eventCount.toLocaleString()}
          sub="델타 구간"
        />
        <StatCard
          label="output"
          value={record.outputTokens.toLocaleString()}
          sub="생성 토큰"
        />
        <StatCard
          label="cache write"
          value={record.cacheCreationTokens.toLocaleString()}
          sub="컨텍스트 재구축 몫"
        />
        <StatCard
          label="cache read"
          value={record.cacheReadTokens.toLocaleString()}
          sub="컨텍스트 재사용"
        />
      </div>

      {/* 신호 — rubric 1단계가 최상단이라 여기서도 먼저 보여준다 */}
      <section className="rounded-xl border border-border bg-card p-4 mb-4">
        <h2 className="text-sm font-medium mb-3">신호</h2>
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
          <h2 className="text-sm font-medium mb-2">요약</h2>
          <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {record.summary}
          </p>
        </section>
      )}

      {record.invocations.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4 mb-4">
          <h2 className="text-sm font-medium mb-3">에이전트·도구 사용 내역</h2>
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

      {record.feedback.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4 mb-4">
          <h2 className="text-sm font-medium mb-3">피드백</h2>
          <div className="space-y-3">
            {record.feedback.map((f) => (
              <div key={f.id}>
                <p className="text-xs font-medium mb-1 flex items-center gap-2">
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
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {record.sessionHygiene && (
        <SessionHygieneSection h={record.sessionHygiene} />
      )}

      {record.costNote && (
        <section className="rounded-xl border border-border bg-card p-4 mb-4">
          <h2 className="text-sm font-medium mb-2">비용 메모</h2>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {record.costNote}
          </p>
        </section>
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
