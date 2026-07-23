# `server/src/scanner/` — 세션 파일 스캔 + 경로/요약 해석

`DATA_DIR`(기본 `~/.claude/projects`)을 훑어 `SessionInfo[]` 를 만든다. 파일 기반 REST
(`/api/sessions*`)와 백필이 사용. `resolveProjectPath` 는 `shared/project-path` 재노출.

```
scanSessions(baseDir?):
    projectsDir = baseDir ?? ~/.claude/projects
    manifest = loadManifest(projectsDir/manifest.json)      # 없으면 {} (방어적)

    for each encoded dir (병렬):
        projectPath = manifest[encoded]                     # ★ 클라우드: manifest 우선
                      ?? resolveProjectPath(encoded)        #   로컬: FS 탐색 폴백
        for each *.jsonl (최상위):
            sessionId = filename - '.jsonl'
            SessionInfo {
                projectPath, projectEncoded: encoded,
                sessionId, filePath, lastModified: mtimeMs,
                subagentFilePaths: findSubagentFiles(dir, sessionId),   # {id}/subagents/*.jsonl
                title?, description?: loadSummary(dir, sessionId),      # .summary.json 사이드카
            }
    return sorted by lastModified desc
```

## 왜 manifest 우선인가

```
encoded '-Users-me-Desktop-my-project' 복원:
    로컬  → 실제 디렉토리 존재 → FS 탐색으로 '/Users/me/Desktop/my-project' 복원 ✅
    클라우드 → 실제 디렉토리 없음 → FS 탐색 실패, 라벨 깨짐 ✗
             → sync 가 로컬에서 만든 manifest.json 을 우선 조회 ✅
```
> `filePath` 는 `baseDir` 기준이라 항상 정확. `projectPath` 만 display-only 라벨.
