import { create } from 'zustand'

/** 기본 조회 범위: 오늘부터 n일 전(YYYY-MM-DD). */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * 커밋 기록 목록 화면의 필터 상태(zustand). 하우스 스타일의 슬라이스 filter store 배치를
 * 따른다 — 페이지 로컬 useState 대신 도메인 store 에 둬 재사용·초기화를 일원화한다.
 * from/to/projectId/userId/agent 가 바뀌면 page 는 1로 되돌린다(빈 페이지 방지).
 */
export interface RecordsFilterState {
  from: string
  to: string
  projectId: number | null
  userId: number | null
  agent: string | null
  page: number
}

interface RecordsFilterActions {
  setFrom: (v: string) => void
  setTo: (v: string) => void
  setProjectId: (v: number | null) => void
  setUserId: (v: number | null) => void
  setAgent: (v: string | null) => void
  setPage: (v: number) => void
  reset: () => void
}

const initialState: RecordsFilterState = {
  from: daysAgo(6),
  to: daysAgo(0),
  projectId: null,
  userId: null,
  agent: null,
  page: 1,
}

// 필터(page 제외)가 바뀌면 첫 페이지로 되돌린다.
export const useRecordsFilter = create<RecordsFilterState & RecordsFilterActions>((set) => ({
  ...initialState,
  setFrom: (from) => set({ from, page: 1 }),
  setTo: (to) => set({ to, page: 1 }),
  setProjectId: (projectId) => set({ projectId, page: 1 }),
  setUserId: (userId) => set({ userId, page: 1 }),
  setAgent: (agent) => set({ agent, page: 1 }),
  setPage: (page) => set({ page }),
  reset: () => set(initialState),
}))
