# Claude Code Observer

`~/.claude/projects/**/*.jsonl` 을 파싱해 Claude Code 세션의 thinking / tool_use /
context injection / 토큰·비용을 시각화하는 모니터링 대시보드.

- **로컬 모드**: 로컬 파일시스템을 직접 읽어 `localhost` 에서 실행
- **클라우드 모드**: 로컬 동기화 잡이 세션을 클라우드로 밀어 넣고, 클라우드 서버가 상시 서빙

---

## 로컬 개발 (localhost)

```bash
npm run install:all
# server/.env 에 AUTH_TOKEN 을 임의 값이라도 설정해야 부팅됨
echo "AUTH_TOKEN=dev-token" > server/.env
echo "HOST=127.0.0.1" >> server/.env
npm run dev
```

- 서버: http://localhost:3001 · 클라이언트: http://localhost:5173
- 최초 접속 시 AuthGate 에 위 토큰(`dev-token`)을 입력한다.

> AUTH_TOKEN 미설정 시 서버는 부팅을 거부한다(인증 없이 외부에 뜨는 사고 방지).

---

## 클라우드 배포

### 1) 서버 (컨테이너)

```bash
# 빌드 컨텍스트는 저장소 루트 (shared/ 참조)
docker build -f server/Dockerfile -t observer-server .
docker run -p 3001:3001 \
  -e AUTH_TOKEN=... \
  -e CLAUDE_DATA_DIR=/data/projects \
  -e ALLOWED_ORIGIN=https://observer.example.com \
  -v /host/observer-data:/data/projects \
  observer-server
```

- `/data/projects` 는 동기화된 세션이 누적되는 **영속 볼륨**이어야 한다.
- HTTPS/WSS 종단은 앞단 리버스 프록시/로드밸런서에 위임한다(컨테이너는 평문 HTTP).
- 환경변수 목록은 [`.env.example`](.env.example) 참조.

### 2) 클라이언트 (정적 빌드)

`VITE_API_BASE` / `VITE_WS_URL` 은 **빌드타임 상수**다. 배포 대상 URL 이 바뀌면
반드시 재빌드해야 한다:

```bash
cd client
VITE_API_BASE=https://observer.example.com \
VITE_WS_URL=wss://observer.example.com \
npm run build
# dist/ 를 정적 호스팅에 업로드
```

미설정 시 `http://localhost:3001` / `ws://localhost:3001` 로 폴백한다.

### 3) 로컬 동기화 잡

로컬 머신에서 `~/.claude` 데이터를 클라우드로 밀어 넣는다. 상세는
[`sync/`](sync/) 참조.

```bash
cd sync
npm install
npm run setup          # 대화형: .env 작성 + 사전 점검(claude CLI·토큰) + launchd 자동등록
# 또는 수동: cp .env.example .env 편집 후
npm run all            # manifest → summaries → upload 순서 (setup 없이 즉시 실행도 가능)
```

`npm run setup` 은 `sync/.env` 를 작성하고, `claude` CLI 로그인·서버 토큰을 점검한 뒤,
원하면 매일 지정 시각에 도는 launchd 에이전트를 등록한다(해제: `launchctl unload
~/Library/LaunchAgents/com.observer.sync.plist`).

- **additive-only**: 로컬에서 세션이 지워져도 클라우드에서는 삭제하지 않는다(과거 기록 보존).
- **요약**: `generate-summaries.ts` 가 로컬에 로그인된 `claude` CLI(Claude Code, **구독 인증**)를
  headless(`claude -p`)로 호출해 세션 제목·설명을 생성한다. **API 키 불필요** — `claude login`
  상태이기만 하면 된다. 생성 자체가 세션을 남기므로 전용 디렉토리에서 실행하고 그 세션은 요약 대상에서 제외한다.
- **전제**: 이 잡은 `claude` CLI 가 설치·로그인된 로컬 머신에서 실행해야 한다.
- **스케줄**: [`sync/launchd/com.observer.sync.plist`](sync/launchd/com.observer.sync.plist)
  (macOS) 또는 cron 으로 퇴근 시각에 `sync/run.sh` 를 실행한다.

---

## 문서

- [`CLAUDE.md`](CLAUDE.md) — 프로젝트 개요 및 설계 결정
- [`vault/projects/spec.md`](vault/projects/spec.md) — 기획서 + 구현 현황
- [`vault/notes/`](vault/notes/) — 날짜별 개발 로그
