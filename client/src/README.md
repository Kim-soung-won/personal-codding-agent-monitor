# `client/src/` — React 대시보드

Vite + React 18. 서버 REST 로 히스토리를 선로드하고 WebSocket 으로 신규 이벤트를 append 하는
**히스토리 + 실시간 하이브리드**. 구조는 flat(`components/hooks/lib/types`).

```
main.tsx → <AuthGate> <BrowserRouter> <App/> </BrowserRouter> </AuthGate>
    AuthGate: localStorage 토큰 없으면 입력 폼 → GET /api/sessions 로 검증 후 통과
```

## 라우팅 (`App.tsx`)

```
/                          AnalyticsPage → GlobalAnalytics(전체 집계) — 메인 화면
/analytics                 → `/` 리다이렉트 (구 URL 호환)
/records                   CommitRecordsPage (커밋 기록 목록)
/records/:id               CommitRecordDetailPage
/reference/pricing         HomePage (Pricing 참고)
/s/:sessionId/:tab         SessionPage   (chat|thinking|tokens|resources)
/p/:projectEncoded/:tab    ProjectPage   (프로젝트 내 세션 집계/개별)
Sidebar: 프로젝트 목록(세션 dedup), 연결 상태 점
```

## 데이터 흐름

```
App 마운트:  apiFetch('/api/sessions') → sessions[]           # Sidebar/라우팅 소스
세션 선택:
    REST:  fetchSessionEvents(id) → 히스토리 이벤트(최근 500)
    WS:    useWebSocket([id]) → 신규 이벤트 실시간 append
    merge: [...historical, ...live.filter(id 안 겹침)]         # e.id 로 중복 제거
    → ChatView / ThinkingViewer / TokenDashboard / ResourcesPanel 에 주입
```

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `lib/config.ts` | `getApiBase/getWsUrl`(빌드타임 env), 토큰 localStorage, `apiFetch`(Bearer 자동) |
| `components/AuthGate.tsx` | 토큰 게이트(번들에 시크릿 안 굽고 런타임 입력) |
| `hooks/useWebSocket.ts` | WS 연결(자동 재연결, `?token=`), 500개 버퍼 |
| `@shared/resource-extract` | 리소스 집계(서버와 공유) |
| `@shared/pricing` | 비용 계산(서버와 공유) |
| `components/SessionTitleBadge.tsx` | 세션 제목·설명(sync 요약) 표시 |

## 배포 주의

```
VITE_API_BASE / VITE_WS_URL = 빌드타임 상수 → 배포 대상 바뀌면 재빌드 필요
VITE_API_BASE=https://... VITE_WS_URL=wss://... npm run build
미설정 시 localhost:3001 폴백
```

## 두 갈래의 데이터원

이 클라이언트는 성격이 다른 두 API 를 함께 쓴다. 화면을 고칠 때 어느 쪽인지 먼저 본다.

| 데이터원 | 소비처 | 성격 |
|----------|--------|------|
| `/api/agent-factory/*` (Postgres) | `pages/CommitRecordsPage`, `pages/CommitRecordDetailPage` · `lib/agentFactoryApi.ts` | **제품 본체.** 커밋 단위로 축적된 기록. 어디서 접속하든 보인다 |
| `/api/sessions*` (로컬 파일 스캔) | `TokenDashboard` · `ResourcesPanel` · `GlobalAnalytics` · 세션/프로젝트 뷰 | 로컬 `~/.claude` 를 직접 읽는 실시간 뷰. **클라우드에서는 비어 있다** |

후자는 클라이언트에서 직접 집계한다(`@shared/pricing`, `@shared/resource-extract`).
서버가 원본 JSONL 을 더는 보관하지 않으므로 서버 집계로 옮길 대상이 아니다.
