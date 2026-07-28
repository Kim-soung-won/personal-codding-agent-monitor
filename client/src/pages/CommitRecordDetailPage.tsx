import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageShell } from '../components/ui/PageShell'
import { StatCard } from '../components/ui/StatCard'
import { cn } from '../lib/utils'
import * as api from '../lib/agentFactoryApi'
import {
  AXIS_LABEL,
  type CommitRecordDetail,
  type FeedbackVerdict,
  type InvocationRow,
  type SessionHygiene,
  type ToolResultSpike,
} from '../types/agentFactory'

// 안티패턴 경고 임계치. 커밋 델타 규모에 맞춘 경험값 — 넘으면 주의로 표시한다.
const SLOPE_WARN = 40000
const JUMP_WARN = 20000
const CR_RATIO_WARN = 50

const VERDICT_STYLE: Record<FeedbackVerdict, string> = {
  GOOD: 'bg-success/10 text-success',
  CONCERN: 'bg-warning/10 text-warning',
  INSUFFICIENT_EVIDENCE: 'bg-muted text-muted-foreground',
}

const VERDICT_LABEL: Record<FeedbackVerdict, string> = {
  GOOD: '양호',
  CONCERN: '주의',
  INSUFFICIENT_EVIDENCE: '근거 부족',
}

const KIND_STYLE: Record<string, string> = {
  AGENT: 'bg-primary/10 text-primary',
  SKILL: 'bg-info/10 text-info',
  MCP: 'bg-accent/10 text-accent',
  TOOL: 'bg-muted text-muted-foreground',
}

function InvocationCell({ row }: { row: InvocationRow }) {
  if (row.rowType === 'AGGREGATE') {
    return <span className="font-mono text-2xs text-muted-foreground">{row.resource}</span>
  }
  return (
    <span className="flex items-center gap-1.5">
      {row.kind && (
        <span
          className={cn(
            'text-2xs px-1.5 py-0.5 rounded font-semibold',
            KIND_STYLE[row.kind] ?? KIND_STYLE.TOOL,
          )}
        >
          {row.kind}
        </span>
      )}
      <span className="font-mono text-xs">{row.resource}</span>
    </span>
  )
}

/** null 은 "산출 불가"(0 과 구별). 그 외엔 천단위 구분 + 접미사. */
function fmtHyg(n: number | null, suffix = ''): string {
  if (n == null) return '산출 불가'
  return n.toLocaleString() + suffix
}

/** 세션 위생(COST 축) — 컨텍스트 누적·재청구 안티패턴 신호. */
function SessionHygieneSection({ h }: { h: SessionHygiene }) {
  // 가장 강한 신호: 리셋 없이 컨텍스트가 단조 누적(기울기 큼 + 리셋 0).
  const monotonicCreep =
    h.contextSlope != null && h.contextSlope >= SLOPE_WARN && h.sessionResets === 0
  const bigTurnJump = h.maxTurnContextJump != null && h.maxTurnContextJump >= JUMP_WARN
  const highReclaimTax = h.crGenRatio != null && h.crGenRatio >= CR_RATIO_WARN

  const spikes: ToolResultSpike[] = Array.isArray(h.toolResultSpikes) ? h.toolResultSpikes : []
  const sortedSpikes = [...spikes].sort((a, b) => b.len - a.len)

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
          tone={monotonicCreep ? 'bad' : 'default'}
        />
        <StatCard
          label="세션 리셋"
          value={fmtHyg(h.sessionResets)}
          sub="compact/clear 누적"
          tone={h.sessionResets === 0 && monotonicCreep ? 'warn' : 'default'}
        />
        <StatCard
          label="턴 급증폭"
          value={fmtHyg(h.maxTurnContextJump)}
          sub="단일 턴 최대 증가"
          tone={bigTurnJump ? 'warn' : 'default'}
        />
        <StatCard
          label="재청구 비율"
          value={h.crGenRatio == null ? '산출 불가' : `${h.crGenRatio.toFixed(1)}%`}
          sub="cache write / read"
          tone={highReclaimTax ? 'warn' : 'default'}
        />
      </div>

      <div className="space-y-2">
        {monotonicCreep && (
          <div className="rounded-lg px-3 py-2 text-xs bg-destructive/5 border border-destructive/20">
            <p className="font-medium">🔴 리셋 없이 컨텍스트 단조 누적</p>
            <p className="text-muted-foreground leading-relaxed">
              기울기 {fmtHyg(h.contextSlope)}/커밋인데 세션 리셋이 0회 — 가장 강한 위생 경고.
              중간에 compact/clear 로 컨텍스트를 끊어줄 지점을 검토하세요.
            </p>
          </div>
        )}
        {bigTurnJump && (
          <div className="rounded-lg px-3 py-2 text-xs bg-warning/5 border border-warning/20">
            <p className="font-medium">🟡 단일 턴 대용량 덤프</p>
            <p className="text-muted-foreground leading-relaxed">
              한 턴에서 컨텍스트가 {fmtHyg(h.maxTurnContextJump)} 토큰 급증 — 대용량 read
              등이 컨텍스트로 끌려들어온 신호.
            </p>
          </div>
        )}
        {highReclaimTax && (
          <div className="rounded-lg px-3 py-2 text-xs bg-warning/5 border border-warning/20">
            <p className="font-medium">🟡 재청구 컨텍스트 세(稅) 과반</p>
            <p className="text-muted-foreground leading-relaxed">
              재청구 비율 {h.crGenRatio?.toFixed(1)}% (샘플 {fmtHyg(h.contextSamples)}건 기준).
              비율 자체는 병이 아니며 세션 길이와 함께 봐야 합니다.
            </p>
          </div>
        )}
        {sortedSpikes.length > 0 && (
          <div className="rounded-lg px-3 py-2 text-xs bg-muted/40 border border-border">
            <p className="font-medium mb-1">tool_result 스파이크 (이후 턴 재청구)</p>
            <ul className="space-y-0.5">
              {sortedSpikes.map((s, i) => (
                <li key={i} className="font-mono text-2xs text-muted-foreground tabular-nums">
                  {s.len.toLocaleString()} chars
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

export function CommitRecordDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [record, setRecord] = useState<CommitRecordDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .getRecord(id)
      .then(setRecord)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <PageShell title="커밋 기록">
        <p className="text-sm text-muted-foreground py-16 text-center">불러오는 중…</p>
      </PageShell>
    )
  }

  if (!record) {
    return (
      <PageShell title="커밋 기록">
        <p className="text-sm text-muted-foreground py-16 text-center">
          기록을 찾을 수 없습니다.{' '}
          <Link to="/" className="text-primary underline">
            목록으로
          </Link>
        </p>
      </PageShell>
    )
  }

  const confirmedSignals = record.signals.filter((s) => s.verdict === 'CONFIRMED')
  const falsePositives = record.signals.filter((s) => s.verdict === 'FALSE_POSITIVE')

  return (
    <PageShell
      title={record.commitSubject ?? record.commitSha.slice(0, 7)}
      subtitle={`${record.commitSha.slice(0, 7)}${record.revision > 1 ? ` · r${record.revision}` : ''} · ${record.project.name} · ${record.capturedAt.slice(0, 10)}`}
    >
      <div className="mb-4">
        <Link to="/" className="text-xs text-primary hover:underline">
          ← 커밋 기록 목록
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="이벤트" value={record.eventCount.toLocaleString()} sub="델타 구간" />
        <StatCard label="output" value={record.outputTokens.toLocaleString()} sub="생성 토큰" />
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
                  'rounded-lg px-3 py-2 text-xs',
                  s.polarity === 'NEGATIVE'
                    ? 'bg-destructive/5 border border-destructive/20'
                    : 'bg-success/5 border border-success/20',
                )}
              >
                <p className="font-medium mb-1">
                  {s.polarity === 'NEGATIVE' ? '🔴 부정' : '🟢 긍정'}
                  {s.confirmedCount != null && ` · 실질 ${s.confirmedCount}건`}
                  {s.turnRef && ` · ${s.turnRef}`}
                </p>
                {s.excerpt && <p className="font-mono text-2xs mb-1">"{s.excerpt}"</p>}
                {s.note && <p className="text-muted-foreground leading-relaxed">{s.note}</p>}
              </div>
            ))}
            {falsePositives.map((s, i) => (
              <p key={`fp-${i}`} className="text-2xs text-muted-foreground">
                {s.polarity === 'NEGATIVE' ? '부정' : '긍정'} 플래그는 재판정에서 전부 오탐으로
                걸러짐
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
                  <th className="text-left font-medium py-1.5 pr-3">도구·에이전트</th>
                  <th className="text-left font-medium py-1.5 pr-3">대상</th>
                  <th className="text-left font-medium py-1.5">비고</th>
                </tr>
              </thead>
              <tbody>
                {record.invocations.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-3 text-muted-foreground tabular-nums">
                      {row.seq ?? '—'}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-2xs">{row.actor}</td>
                    <td className="py-1.5 pr-3">
                      <InvocationCell row={row} />
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{row.target ?? '—'}</td>
                    <td
                      className={cn(
                        'py-1.5 text-2xs',
                        row.isError ? 'text-destructive font-medium' : 'text-muted-foreground',
                      )}
                    >
                      {row.note ?? '—'}
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
                      className={cn('text-2xs px-1.5 py-0.5 rounded', VERDICT_STYLE[f.verdict])}
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

      {record.sessionHygiene && <SessionHygieneSection h={record.sessionHygiene} />}

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
          {showRaw ? '원문 접기' : '원문 보기 (.md)'}
        </button>
        {showRaw && (
          <pre className="mt-3 text-2xs bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
            {record.rawMarkdown}
          </pre>
        )}
      </section>
    </PageShell>
  )
}
