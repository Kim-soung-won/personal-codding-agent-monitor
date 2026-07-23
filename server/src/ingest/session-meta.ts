/**
 * 파싱된 raw 이벤트 배열에서 세션 메타데이터를 추출한다(파서 수정 없이).
 *
 * ai-title/custom-title 은 파서가 'unknown' 으로 분류하지만 raw 는 보존되므로
 * 여기서 직접 raw.type 을 보고 최신값을 취한다(세션 중 여러 번 재발행됨).
 */

export function extractTitles(
  rawEvents: Array<Record<string, unknown>>,
): { aiTitle?: string; customTitle?: string } {
  let aiTitle: string | undefined
  let customTitle: string | undefined
  for (const o of rawEvents) {
    if (o.type === 'ai-title' && typeof o.aiTitle === 'string') aiTitle = o.aiTitle
    if (o.type === 'custom-title' && typeof o.customTitle === 'string') customTitle = o.customTitle
  }
  return { aiTitle, customTitle }
}

/** cwd(프로젝트 경로)·gitBranch·version 을 최초 관측값으로 추출. */
export function extractSessionScalars(
  rawEvents: Array<Record<string, unknown>>,
): { cwd?: string; gitBranch?: string; version?: string } {
  let cwd: string | undefined
  let gitBranch: string | undefined
  let version: string | undefined
  for (const o of rawEvents) {
    if (!cwd && typeof o.cwd === 'string') cwd = o.cwd
    if (!gitBranch && typeof o.gitBranch === 'string') gitBranch = o.gitBranch
    if (!version && typeof o.version === 'string') version = o.version
    if (cwd && gitBranch && version) break
  }
  return { cwd, gitBranch, version }
}

/** 경로 마지막 세그먼트(크로스유저 프로젝트 그룹핑용 name). */
export function projectName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}
