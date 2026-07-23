import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * `${projectDir}/${sessionId}.summary.json` 사이드카에서 제목·설명을 읽는다.
 * (scanner 의 동명 로직과 동일 — ingest 에서 sessions.description 채우기용). 부재/실패 시 빈 객체.
 */
export async function loadSummarySidecar(
  projectDir: string,
  sessionId: string,
): Promise<{ title?: string; description?: string }> {
  try {
    const text = await readFile(join(projectDir, `${sessionId}.summary.json`), 'utf8')
    const parsed = JSON.parse(text) as Record<string, unknown>
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
    }
  } catch {
    return {}
  }
}
