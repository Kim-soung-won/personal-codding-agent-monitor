import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRecord } from '../../agent-factory/record-parser.js'

const here = dirname(fileURLToPath(import.meta.url))
/** summarizer 가 실제로 남긴 기록. 합성 픽스처면 형식 흔들림을 못 잡는다. */
const REAL_RECORD = readFileSync(join(here, '../fixtures/agent-factory/3738488.md'), 'utf8')

describe('parseRecord — frontmatter', () => {
  it('커밋 신원과 세션 id 를 읽는다', () => {
    const r = parseRecord(REAL_RECORD)
    expect(r.commitSha).toBe('3738488511ac2ff0a627af0fdd05a225e2a3d628')
    expect(r.sessionId).toBe('7b73eb58-3c4d-45fe-9193-9cb7a07a612b')
  })

  it('콜론을 품은 인용된 commit_subject 의 따옴표만 벗기고 콜론은 보존한다', () => {
    const r = parseRecord(REAL_RECORD)
    expect(r.commitSubject).toBe(
      'feat: 스킬/에이전트 재배치 + planning·agent-factory 플러그인 신설, 부정 경계문 규범화',
    )
  })

  it('cost_tokens 인라인 맵을 4개 토큰 컬럼으로 편다', () => {
    const r = parseRecord(REAL_RECORD)
    expect(r.inputTokens).toBe(1884)
    expect(r.outputTokens).toBe(371591)
    expect(r.cacheReadTokens).toBe(42923778)
    expect(r.cacheCreationTokens).toBe(1233884)
    expect(r.eventCount).toBe(572)
  })

  it('agents 목록의 plugin:agent 를 분리하고 반복 등장은 spawnCount 로 센다', () => {
    const r = parseRecord(REAL_RECORD)
    // 원본 agents 는 [evaluator, creator, skill-creator] — creator 는 표에서 2회 쓰였지만
    // frontmatter 에는 1회만 나열되므로 spawnCount 는 1이다.
    expect(r.agents).toHaveLength(3)
    expect(r.agents.every((a) => a.plugin === 'claude-code-docs-plugin')).toBe(true)
    expect(r.agents.map((a) => a.agent)).toEqual([
      'subagent-evaluator',
      'subagent-creator',
      'claude-skill-creator',
    ])
  })
})

describe('parseRecord — 신호', () => {
  it('실질 0건인 부정 신호를 FALSE_POSITIVE 로 판정한다', () => {
    const r = parseRecord(REAL_RECORD)
    const neg = r.signals.find((s) => s.polarity === 'NEGATIVE')
    expect(neg).toBeDefined()
    expect(neg!.channel).toBe('OUTPUT')
    expect(neg!.verdict).toBe('FALSE_POSITIVE')
    expect(neg!.confirmedCount).toBe(0)
  })

  it('실질 1건인 긍정 신호를 CONFIRMED 로 판정하고 발화·인용을 뽑는다', () => {
    const r = parseRecord(REAL_RECORD)
    const pos = r.signals.find((s) => s.polarity === 'POSITIVE')
    expect(pos).toBeDefined()
    expect(pos!.channel).toBe('INPUT')
    expect(pos!.verdict).toBe('CONFIRMED')
    expect(pos!.confirmedCount).toBe(1)
    expect(pos!.excerpt).toBe('좋아 착수해줘')
    expect(pos!.turnRef).toBe('u22')
  })
})

describe('parseRecord — 사용 내역 표', () => {
  it('번호 있는 행은 ITEM 으로, 도구 셀에서 에이전트 이름을 뽑는다', () => {
    const r = parseRecord(REAL_RECORD)
    const items = r.invocations.filter((i) => i.rowType === 'ITEM')
    expect(items).toHaveLength(4)
    expect(items[0]).toMatchObject({
      seq: 1,
      actor: 'main',
      kind: 'AGENT',
      resource: 'subagent-evaluator',
      isError: false,
    })
  })

  it('"—" 행은 순서 없는 AGGREGATE 로 담고 셀 원문을 보존한다', () => {
    const r = parseRecord(REAL_RECORD)
    const agg = r.invocations.filter((i) => i.rowType === 'AGGREGATE')
    expect(agg).toHaveLength(1)
    expect(agg[0].seq).toBeNull()
    expect(agg[0].kind).toBeNull()
    expect(agg[0].resource).toContain('Edit×29')
  })

  it('비고의 권한거부를 실패로 표시한다', () => {
    const r = parseRecord(REAL_RECORD)
    const failed = r.invocations.filter((i) => i.isError)
    expect(failed).toHaveLength(1)
    expect(failed[0].resource).toBe('subagent-creator')
    expect(failed[0].note).toContain('권한거부')
  })
})

describe('parseRecord — 피드백', () => {
  it('rubric 5개 축을 모두 축 enum 으로 매핑한다', () => {
    const r = parseRecord(REAL_RECORD)
    expect(r.feedback.map((f) => f.axis)).toEqual([
      'DELEGATION_FIT',
      'REWORK_LOOP',
      'TOOL_SCOPING',
      'COST',
      'REPO_NORMS',
    ])
  })

  it('"양호"가 적힌 축은 GOOD 으로 판정한다', () => {
    const r = parseRecord(REAL_RECORD)
    const delegation = r.feedback.find((f) => f.axis === 'DELEGATION_FIT')
    expect(delegation!.verdict).toBe('GOOD')
  })

  it('부정된 마커를 CONCERN 으로 뒤집지 않는다', () => {
    const r = parseRecord(REAL_RECORD)
    // 비용 축 본문은 "낭비 지점은 두드러지지 않음" — 단어만 보면 CONCERN 으로 오판된다.
    const cost = r.feedback.find((f) => f.axis === 'COST')
    expect(cost!.body).toContain('낭비')
    expect(cost!.verdict).not.toBe('CONCERN')

    // 도구 스코핑 축도 "과한 도구 동원 없음" 이다.
    const scoping = r.feedback.find((f) => f.axis === 'TOOL_SCOPING')
    expect(scoping!.verdict).not.toBe('CONCERN')
  })

  it('부정되지 않은 마커는 CONCERN 으로 잡는다', () => {
    const r = parseRecord(REAL_RECORD)
    // 재작업 축은 "부분 스테이징의 위험", "1회 수동 재작업" 등 실제 결함을 적었다.
    const rework = r.feedback.find((f) => f.axis === 'REWORK_LOOP')
    expect(rework!.verdict).toBe('CONCERN')
  })
})

describe('parseRecord — 서술 섹션', () => {
  it('요약과 비용 메모를 각각 담는다', () => {
    const r = parseRecord(REAL_RECORD)
    expect(r.summary).toContain('마켓플레이스로 이관')
    expect(r.costNote).toContain('워터마크 델타')
    // 섹션이 서로 새지 않아야 한다
    expect(r.summary).not.toContain('워터마크 델타로 이 큰 구간이')
  })
})

describe('parseRecord — 견고성', () => {
  it('빈 입력에도 던지지 않고 경고만 남긴다', () => {
    const r = parseRecord('')
    expect(r.commitSha).toBeNull()
    expect(r.agents).toEqual([])
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('frontmatter 만 있고 본문이 없어도 계량치는 살린다', () => {
    const r = parseRecord(
      ['---', 'commit: abc123', 'event_count: 7', 'cost_tokens: { input: 5 }', '---', ''].join(
        '\n',
      ),
    )
    expect(r.commitSha).toBe('abc123')
    expect(r.eventCount).toBe(7)
    expect(r.inputTokens).toBe(5)
    expect(r.summary).toBeNull()
  })

  it('감정 신호 없음으로 적힌 기록은 신호 0건으로 읽는다', () => {
    const r = parseRecord(['---', 'commit: abc', '---', '', '## 신호', '', '감정 신호 없음'].join('\n'))
    expect(r.signals).toEqual([])
  })
})
