import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * MCP 서버 접속 설정.
 *
 * 관리포인트 통합: push 훅과 **같은** `~/.agent-factory/config.json`(apiBase·token)을
 * 재사용한다. 토큰·주소를 한 곳에서만 관리하면 캡처·적재·조회가 한 설정을 공유한다.
 * 환경변수(AGENT_FACTORY_API_BASE / AGENT_FACTORY_TOKEN)가 있으면 그것이 우선한다.
 */
export interface ObserverConfig {
  apiBase: string;
  token: string;
}

const CONFIG_PATH = path.join(os.homedir(), ".agent-factory", "config.json");

export function loadConfig(): ObserverConfig {
  let fileCfg: Partial<ObserverConfig> = {};
  try {
    fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    // 파일이 없거나 깨져도 env 로만 동작할 수 있게 조용히 넘어간다.
  }

  const apiBase = process.env.AGENT_FACTORY_API_BASE ?? fileCfg.apiBase;
  const token = process.env.AGENT_FACTORY_TOKEN ?? fileCfg.token;

  if (!apiBase || !token) {
    throw new Error(
      `observer 설정을 찾지 못함 — ${CONFIG_PATH} 의 {apiBase, token} 또는 ` +
        `환경변수 AGENT_FACTORY_API_BASE / AGENT_FACTORY_TOKEN 이 필요하다.`,
    );
  }
  return { apiBase: apiBase.replace(/\/+$/, ""), token };
}
