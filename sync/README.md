# `sync/` — 로컬 동기화 잡 (로컬 사용자 프로그램)

로컬 머신에서 `~/.claude/projects` 를 읽어 **세션 요약을 생성**하고 클라우드 서버로
**additive 업로드**한다. 클라우드 서버는 이 데이터를 받아 파일 저장 + DB 적재한다.

> 왜 로컬인가: JSONL 원본과 `claude` CLI(구독 인증)가 로컬에만 있다. 클라우드로 API 키를
> 보내지 않기 위해 요약도 로컬에서 만든다.

---

## 파일

| 파일 | 역할 |
|------|------|
| `setup.ts` | 대화형 설치·설정 (`.env` 작성 + 사전 점검 + launchd 등록) |
| `generate-manifest.ts` | `encoded → 실제 경로` manifest 생성·업로드 |
| `generate-summaries.ts` | `claude -p` 로 세션 title/description 요약 생성 → 사이드카 + 업로드 |
| `upload-sessions.ts` | 변경된 jsonl(메인+서브에이전트) additive 업로드 |
| `core.ts` | 순수 로직(diff·manifest 병합·transcript·env 파싱) — 단위 테스트 대상 |
| `http.ts` | 인증 PUT 헬퍼 + `.env` 로딩 |
| `state.ts` | `~/.claude-observer/*.json` 상태 파일 읽기/쓰기 |
| `git-identity.ts` | `git config user.email/name` 조회(유저 귀속용) |
| `run.sh` / `launchd/*.plist` | 스케줄 실행 |

---

## 전체 흐름 (`run.sh` = manifest → summaries → upload)

```
setup (1회):
    ask CLOUD_URL, AUTH_TOKEN, model → write sync/.env
    check `claude` CLI 있음? / 토큰 유효?(GET /api/sessions)
    (선택) launchd 등록: run.sh 절대경로+PATH 주입한 plist → launchctl load

매 실행 (스케줄 또는 npm run all):
    env = loadEnv()                          # CLOUD_URL, AUTH_TOKEN, model

    # 1. manifest
    for each dir in ~/.claude/projects:
        manifest[encoded] = resolveProjectPath(encoded)   # shared/project-path
    merged = mergeManifest(localCache, manifest)          # additive(사라진 것 유지)
    PUT /api/sync/manifest  merged

    # 2. summaries  (claude CLI, 구독 인증)
    state = readState("summary-state.json")               # sessionId → 마지막 요약 mtime
    for each session where lastModified > state[id]:
        if session in ~/.claude-observer/summarizer: skip  # 재귀 요약 방지
        transcript = buildTranscript(parse(session events))
        {title, description} = runClaude("-p", transcript, model)   # 실패 시 skip
        write {sessionId,title,description,generatedAt} → {id}.summary.json
        PUT /api/sync/summary/:id?encoded=...
        state[id] = lastModified

    # 3. upload  (additive, mtime diff)
    identity = getGitIdentity()                            # X-User-* 헤더
    state = readState("sync-state.json")                   # filePath → mtimeMs
    changed = selectChangedFiles(collectFiles(), state)    # 신규/변경만, 삭제는 전파 안 함
    for f in changed:
        PUT /api/sync/{session|subagent}/...  body=f.content  headers=identity
        state[f.path] = f.mtimeMs                          # 성공분만 기록(실패는 재시도)
```

---

## 불변 규칙

- **additive-only**: 로컬에서 세션이 지워져도 서버로 삭제 요청을 보내지 않는다(과거 보존).
- **API 키 없음**: 요약은 `claude -p`(구독). `ANTHROPIC_API_KEY` 를 쓰지 않는다.
- **멱등**: mtime 상태 파일로 변경분만 처리. 상태 파일이 유실되면 전량 재업로드(무해).
- **실패 격리**: 파일별 업로드 실패는 해당 파일만 상태 미기록 → 다음 실행에서 재시도.

## 실행

```bash
npm install && npm run setup     # 최초 1회
npm run all                      # manifest → summaries → upload
npm run test                     # core.ts 순수 로직 테스트
```
