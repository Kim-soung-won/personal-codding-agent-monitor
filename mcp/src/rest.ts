import { loadConfig } from "./config.js";

/**
 * observer REST 클라이언트. 모든 MCP 도구는 이 한 곳을 거쳐 기존 API 를 호출한다 —
 * 집계 로직을 중복하지 않고 서버가 이미 계산한 결과를 그대로 쓴다(관리포인트 통합).
 *
 * 응답 규약: `{ success, data }` 또는 `{ success:false, error }`. success=false 이면
 * 에러를 던져 MCP 도구가 isError 로 응답하게 한다.
 */
export async function apiGet<T = unknown>(
  pathname: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const { apiBase, token } = loadConfig();
  const url = new URL(apiBase + pathname);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new Error(`observer 서버에 연결 실패 (${url.origin}): ${String(err)}`);
  }

  const bodyText = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`observer 응답이 JSON 이 아님 (HTTP ${res.status}): ${bodyText.slice(0, 200)}`);
  }

  if (!res.ok || (body as { success?: boolean })?.success === false) {
    const msg = (body as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(`observer API 오류 (${pathname}): ${msg}`);
  }
  return (body as { data: T }).data;
}
