/** 세션·프로젝트 표시용 포맷 헬퍼(순수). 여러 세션 화면이 공유한다. */

/** epoch ms → "8월 3일 14:30" 같은 짧은 한국어 표기. */
export function formatSessionTime(ms: number): string {
  return new Date(ms).toLocaleDateString('ko-KR', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** 프로젝트 절대경로에서 마지막 세그먼트(레포명)만 뽑는다. */
export function projectLabel(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}
