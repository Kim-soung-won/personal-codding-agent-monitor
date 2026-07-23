# `client/src/` — React 대시보드

Vite + React 18. 서버 REST 로 히스토리를 선로드하고 WebSocket 으로 신규 이벤트를 append 하는
**히스토리 + 실시간 하이브리드**. 구조는 flat(`components/hooks/lib/types`).

```
main.tsx → <AuthGate> <BrowserRouter> <App/> </BrowserRouter> </AuthGate>
    AuthGate: localStorage 토큰 없으면 입력 폼 → GET /api/sessions 로 검증 후 통과
```

## 라우팅 (`App.tsx`)

```
/                          HomePage (WelcomeDashboard)
/analytics                 AnalyticsPage → GlobalAnalytics(전체 리소스 집계)
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

## Phase 2b (예정)

서버 `/api/stats/*`, `/api/db/sessions*` 는 준비 완료. 남은 작업:
`lib/statsApi.ts` + 훅으로 소비 → 리소스/플러그인 평가 뷰, sub-agent 통계, 날짜·유저 필터.
현재 `GlobalAnalytics` 는 세션 이벤트를 클라이언트에서 직접 집계 → 서버 집계로 전환 대상.
