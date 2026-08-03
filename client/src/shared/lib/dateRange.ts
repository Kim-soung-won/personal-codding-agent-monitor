/**
 * 날짜 축 유틸.
 *
 * 집계 응답은 **행이 있는 날만** 돌려준다. 그대로 축에 쓰면 기록이 없는 날이 통째로
 * 사라져 7일치가 3칸으로 보이고, 띄엄띄엄한 날짜가 등간격으로 붙어 실제보다 촘촘해
 * 보인다. 그래서 축은 항상 조회 구간 전체를 채우고 빈 날은 0으로 그린다.
 */

/** YYYY-MM-DD(로컬 기준). */
export function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * start~end(양끝 포함)의 모든 날짜를 YYYY-MM-DD 로 나열한다.
 * 뒤집힌 구간(start > end)은 빈 배열. 날짜 문자열은 로컬 자정으로 해석한다.
 */
export function enumerateDays(start: string, end: string): string[] {
  const from = parseDayKey(start)
  const to = parseDayKey(end)
  if (!from || !to || from > to) return []

  const days: string[] = []
  // Date 산술 대신 setDate 로 넘긴다 — DST 로 하루가 23/25시간인 날에도 날짜가 밀리지 않는다.
  for (const cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    days.push(toDayKey(cursor))
  }
  return days
}

function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
