import { StatCard } from "@/shared/ui/StatCard";
import { cn } from "@/shared/lib/utils";
import { type SessionHygiene, type ToolResultSpike } from "@/entities/commit-record";

// 안티패턴 경고 임계치. 커밋 델타 규모에 맞춘 경험값 — 넘으면 주의로 표시한다.
const SLOPE_WARN = 40000;
const JUMP_WARN = 100000;
const CR_RATIO_WARN = 50;

// 글자수→토큰 대략 환산(영문·코드 기준 경험값). 정밀치가 아니라 체감 규모용이라 "약"으로 표기한다.
const CHARS_PER_TOKEN = 4;

/** null 은 "산출 불가"(0 과 구별). 그 외엔 천단위 구분 + 접미사. */
function fmtHyg(n: number | null, suffix = ""): string {
  if (n == null) return "산출 불가";
  return n.toLocaleString() + suffix;
}

/** 글자수를 대략 토큰 수로 환산한다(체감용 근사). */
function approxTokens(chars: number): number {
  return Math.round(chars / CHARS_PER_TOKEN);
}

/** 세션 위생(COST 축) — 컨텍스트 누적·재청구 안티패턴 신호. */
export function SessionHygieneSection({ h }: { h: SessionHygiene }) {
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
            <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
              재청구 추정 비용 순 (막대 = 최댓값 대비)
            </p>
            <ul className="space-y-2.5">
              {sortedSpikes.map((s, i) => {
                const pct = maxCost > 0 ? Math.round((costOf(s) / maxCost) * 100) : 0;
                // rebilled_tokens 가 오면 재청구 비용을, 없으면(구버전) 크기만 폴백 표기.
                const hasRebill = s.rebilled_tokens != null;
                const isUser = s.tool === "user_input";
                const label = s.tool
                  ? `${isUser ? "사용자 입력" : s.tool}${s.target ? ` ${s.target}` : ""}`
                  : "대용량 결과";
                return (
                  <li key={i} className="space-y-1">
                    {/* 1줄: 원인 라벨(전폭·잘림) + 핵심 수치 */}
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80">
                        {typeof s.turn === "number" && (
                          <span className={cn("mr-1.5 font-semibold", isUser ? "text-warning" : "text-muted-foreground")}>
                            t{s.turn}
                          </span>
                        )}
                        {label}
                      </span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">
                        {hasRebill
                          ? `약 ${s.rebilled_tokens!.toLocaleString()} tok`
                          : `${s.len.toLocaleString()}자`}
                      </span>
                    </div>
                    {/* 2줄: 전폭 막대 + 부가정보 */}
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-warning/60"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                        {hasRebill
                          ? `${s.turns_resident ?? 0}턴 잔류 · ${s.len.toLocaleString()}자`
                          : `약 ${approxTokens(s.len).toLocaleString()}토큰`}
                      </span>
                    </div>
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
