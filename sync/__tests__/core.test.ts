import { describe, it, expect } from 'vitest'
import {
  selectChangedFiles,
  updateState,
  mergeManifest,
  parseEnvFile,
  parseSummaryResponse,
  buildTranscript,
} from '../core.js'
import type { NormalizedEvent } from '../../server/src/types.js'

describe('selectChangedFiles', () => {
  it('신규 파일과 mtime 이 증가한 파일만 고른다', () => {
    const files = [
      { path: '/a', mtimeMs: 100 },
      { path: '/b', mtimeMs: 200 },
      { path: '/c', mtimeMs: 50 },
    ]
    const state = { '/b': 200, '/c': 40 }
    const changed = selectChangedFiles(files, state)
    const paths = changed.map((f) => f.path).sort()
    // /a: 신규, /c: 40→50 증가. /b: 동일하므로 제외
    expect(paths).toEqual(['/a', '/c'])
  })

  it('로컬에서 사라진 파일은 입력에 없어 삭제가 전파되지 않는다', () => {
    // state 에 있던 /gone 은 files 에 없으므로 결과에 영향 없음(additive-only)
    const files = [{ path: '/a', mtimeMs: 100 }]
    const state = { '/gone': 999 }
    expect(selectChangedFiles(files, state).map((f) => f.path)).toEqual(['/a'])
  })
})

describe('updateState', () => {
  it('기존 키를 유지하며 처리한 파일의 mtime 을 병합한다', () => {
    const state = { '/old': 1 }
    const next = updateState(state, [{ path: '/new', mtimeMs: 2 }])
    expect(next).toEqual({ '/old': 1, '/new': 2 })
  })
})

describe('mergeManifest', () => {
  it('next 가 덮어쓰되 prev 전용 키는 삭제하지 않는다', () => {
    const prev = { a: '/path/a', b: '/path/b' }
    const next = { b: '/path/b2', c: '/path/c' }
    expect(mergeManifest(prev, next)).toEqual({
      a: '/path/a',
      b: '/path/b2',
      c: '/path/c',
    })
  })
})

describe('parseEnvFile', () => {
  it('KEY=VALUE 를 파싱하고 주석·빈 줄·따옴표를 처리한다', () => {
    const text = ['# 주석', '', 'FOO=bar', 'QUOTED="hello world"', 'EQ=a=b=c'].join('\n')
    expect(parseEnvFile(text)).toEqual({
      FOO: 'bar',
      QUOTED: 'hello world',
      EQ: 'a=b=c',
    })
  })
})

describe('parseSummaryResponse', () => {
  it('순수 JSON 을 파싱한다', () => {
    expect(parseSummaryResponse('{"title":"제목","description":"설명"}')).toEqual({
      title: '제목',
      description: '설명',
    })
  })

  it('코드펜스로 감싸인 응답에서도 JSON 을 추출한다', () => {
    const text = '```json\n{"title":"T","description":"D"}\n```'
    expect(parseSummaryResponse(text)).toEqual({ title: 'T', description: 'D' })
  })

  it('필드 누락 시 null', () => {
    expect(parseSummaryResponse('{"title":"only"}')).toBeNull()
  })

  it('JSON 이 아니면 null', () => {
    expect(parseSummaryResponse('요약 실패')).toBeNull()
  })
})

describe('buildTranscript', () => {
  const ev = (category: NormalizedEvent['category'], summary: string): NormalizedEvent => ({
    id: Math.random().toString(),
    sessionId: 's',
    timestamp: '2026-07-23T00:00:00.000Z',
    category,
    raw: {},
    summary,
    origin: 'main',
  })

  it('화자 태그를 붙여 대화만 추린다', () => {
    const events = [
      ev('user-input', '로그인 버그 고쳐줘'),
      ev('thinking', '원인을 분석 중'),
      ev('tool-use', 'Edit → auth.ts'),
      ev('context-injection', '(무시되어야 함)'),
    ]
    const t = buildTranscript(events)
    expect(t).toContain('[사용자] 로그인 버그 고쳐줘')
    expect(t).toContain('[도구] Edit → auth.ts')
    expect(t).not.toContain('무시되어야 함')
  })

  it('상한을 넘으면 가운데를 생략한다', () => {
    const events = Array.from({ length: 2000 }, (_, i) => ev('user-input', `줄${i} 내용내용내용`))
    const t = buildTranscript(events)
    expect(t).toContain('…(중략)…')
  })
})
