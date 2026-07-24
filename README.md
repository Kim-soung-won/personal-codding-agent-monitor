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

### 3) 데이터 적재 — agent-factory 플러그인 훅

이 서버는 원본 JSONL 을 받지 않는다. 로컬에서 요약·해석까지 끝낸 커밋 기록
`.agent-factory/sessions/<sha>.md` 한 장만 올라온다.

적재 주체는 [`agent-factory-plugin`](../personal-plugins/plugins/agent-factory-plugin/) 이다:

```
git commit → PostToolUse hook   : 커밋 델타 캡처
           → summarizer 에이전트 : 요약 + 5축 피드백 + 감정 신호 → <sha>.md
           → Stop hook           : 미전송분만 POST /api/agent-factory/records
```

작업 레포에서 아래 둘만 설정하면 된다(없으면 업로드 단계는 조용히 건너뛴다):

```bash
export OBSERVER_API_BASE=https://observer.example.com
export OBSERVER_TOKEN=<서버 AUTH_TOKEN 과 같은 값>
```

- **멱등**: 서버는 `(project, commitSha, revision)` 기준으로 upsert 하고, 훅은 내용
  해시로 이미 보낸 파일을 건너뛴다. 같은 기록을 몇 번 밀어도 행이 늘지 않는다.
- **원본 무손실**: `.md` 전문을 `rawMarkdown` 에 보관한다. 파싱 스키마가 바뀌어도
  재파싱으로 복구할 수 있다.
- **훅은 흐름을 막지 않는다**: 서버가 죽어 있거나 설정이 없어도 조용히 넘어가고 항상 exit 0.

---

## 문서

- [`CLAUDE.md`](CLAUDE.md) — 프로젝트 개요 및 설계 결정
- [`vault/projects/spec.md`](vault/projects/spec.md) — 기획서 + 구현 현황
- [`vault/notes/`](vault/notes/) — 날짜별 개발 로그
