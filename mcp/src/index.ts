#!/usr/bin/env node
/**
 * claude-code-observer MCP 서버 (stdio).
 *
 * 커밋 단위 에이전트 사용 집계를, UI 가 아니라 Claude Code 에서 질의하게 노출한다.
 * 데이터는 observer 서버의 기존 REST(`/api/agent-factory/*`)를 그대로 호출해 얻는다 —
 * 집계 로직·인증·설정을 한 곳(서버 + ~/.agent-factory/config.json)으로 통합한다.
 *
 * 모든 도구는 **읽기 전용**이다. "수준 평가"의 판정 기준(5축 rubric 대조)은 이 서버가
 * 아니라 `.claude/skills/agent-usage-review` 스킬이 맡는다 — 서버는 근거 데이터만 낸다.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { apiGet } from "./rest.js";

const server = new McpServer({
  name: "claude-code-observer",
  version: "0.1.0",
});

/** 결과 객체를 MCP 텍스트 컨텐츠(JSON)로 감싼다. */
function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** 에러를 isError 응답으로 (Claude 가 이유를 읽고 대처하게). */
function errorResult(err: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }],
  };
}

server.registerTool(
  "list_agent_usage",
  {
    title: "에이전트별 사용 집계",
    description:
      "커밋 전체에 걸친 에이전트별 사용량 집계. 각 행: plugin·agent·commits(등장 커밋 수)·" +
      "spawns·inputTokens·outputTokens·cacheReadTokens·cacheCreationTokens·toolCalls·errors. " +
      "'이 에이전트를 실제로 얼마나 쓰고, 오류율은 어떤가'를 판단하는 1차 근거. outputTokens 내림차순.",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonResult(await apiGet("/api/agent-factory/stats/agents"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "list_plugin_usage",
  {
    title: "플러그인별 사용 집계",
    description:
      "플러그인 축으로 합친 사용량(소속 에이전트 계량치 합). agents(고유 에이전트 수)·commits·" +
      "spawns·토큰·toolCalls·errors. 어떤 플러그인에 사용이 몰리는지·비용이 큰지 본다.",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonResult(await apiGet("/api/agent-factory/stats/plugins"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "list_skill_usage",
  {
    title: "스킬별 사용 집계",
    description:
      "커밋 전체에 걸친 스킬별 호출 빈도. 각 행: skill(이름)·plugin·invocations(총 호출)·" +
      "commits(등장 커밋 수)·errors. 스킬은 토큰 계량치가 없어 빈도 축으로 본다 — '어떤 스킬을 " +
      "얼마나 자주·어느 커밋에서 쓰나'. 스킬 사용을 이름과 함께 기록하는 규격 이후 커밋부터 채워진다.",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonResult(await apiGet("/api/agent-factory/stats/skills"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "feedback_breakdown",
  {
    title: "피드백 5축 판정 분포",
    description:
      "축(axis)×판정(verdict)별 피드백 건수. axis: DELEGATION_FIT(위임 적절성)·REWORK_LOOP" +
      "(재작업·정정 루프)·TOOL_SCOPING(도구 스코핑)·COST(비용)·REPO_NORMS(저장소 규범). " +
      "verdict: GOOD·CONCERN·INSUFFICIENT_EVIDENCE. 어느 축에서 반복적으로 CONCERN 이 나오는지 = " +
      "사용 수준의 약점을 가장 직접적으로 드러내는 신호. 수준 평가의 핵심 입력.",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonResult(await apiGet("/api/agent-factory/stats/feedback"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "signal_summary",
  {
    title: "감정 신호 집계",
    description:
      "polarity(POSITIVE/NEGATIVE)×verdict(CONFIRMED/FALSE_POSITIVE)별 건수. 확정된 부정 신호는 " +
      "정정 루프·불만의 지표, FALSE_POSITIVE 는 감지기 오탐율(신뢰도)을 뜻한다. 신호를 단독으로 " +
      "'나쁨'으로 읽지 말고 오탐 비율과 함께 해석한다.",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonResult(await apiGet("/api/agent-factory/stats/signals"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "token_trend",
  {
    title: "일자별 토큰 소비 추세",
    description:
      "capturedAt 을 날짜로 잘라 집계한 일자별 토큰(input/output/cache) 및 커밋 수. 비용(COST 축) " +
      "추세를 시간축으로 본다.",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonResult(await apiGet("/api/agent-factory/stats/tokens/daily"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "search_records",
  {
    title: "커밋 기록 검색",
    description:
      "커밋 기록(관측 단위 = 커밋 델타 1건)을 필터로 조회. 특정 프로젝트·기간·에이전트로 좁혀 " +
      "드릴다운할 때. 목록 항목은 요약 필드만(rawMarkdown 제외) — 상세·근거는 get_record 로.",
    inputSchema: {
      projectId: z.number().int().optional().describe("프로젝트 id (get_meta 로 조회)"),
      userId: z.number().int().optional().describe("작성자 id (get_meta 로 조회)"),
      agent: z.string().optional().describe("에이전트 이름(정확 일치). 그 에이전트를 쓴 커밋만."),
      status: z.enum(["CAPTURED", "SUMMARIZED"]).optional().describe("적재 단계"),
      from: z.string().optional().describe("시작일 YYYY-MM-DD (포함)"),
      to: z.string().optional().describe("종료일 YYYY-MM-DD (그날 끝까지 포함)"),
      page: z.number().int().min(1).optional().describe("페이지(기본 1)"),
      pageSize: z.number().int().min(1).max(100).optional().describe("페이지 크기(기본 20, 최대 100)"),
    },
  },
  async (args) => {
    try {
      return jsonResult(await apiGet("/api/agent-factory/records", args));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "get_record",
  {
    title: "커밋 기록 상세(근거 원문)",
    description:
      "한 커밋 기록의 전체 상세: summary·costNote·5축 feedback(본문)·signals·invocations·" +
      "sessionHygiene·그리고 rawMarkdown(요약 원문). 평가를 **특정 커밋으로 인용·근거화**할 때 쓴다. " +
      "id 는 search_records 결과의 항목 id.",
    inputSchema: {
      id: z.string().describe("CommitRecord id (cuid)"),
    },
  },
  async ({ id }) => {
    try {
      return jsonResult(await apiGet(`/api/agent-factory/records/${encodeURIComponent(id)}`));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "get_meta",
  {
    title: "필터 차원(프로젝트·작성자)",
    description: "search_records 필터에 쓸 projects·users 목록(id 포함).",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonResult(await apiGet("/api/agent-factory/meta"));
    } catch (err) {
      return errorResult(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
