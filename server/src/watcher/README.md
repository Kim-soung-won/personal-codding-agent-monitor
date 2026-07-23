# `server/src/watcher/` — 실시간 tail + WebSocket 브로드캐스트

`DATA_DIR/**/*.jsonl` 을 chokidar 로 감시하다가, 파일이 커지면 **늘어난 바이트만** 읽어
파싱 후 WebSocket 으로 브로드캐스트한다. 로컬 dev 의 실시간 스트리밍용.

```
startWatcher(broadcast, baseDir?):
    pattern = (baseDir ?? ~/.claude/projects)/**/*.jsonl
    chokidar.watch(pattern, {ignoreInitial, awaitWriteFinish})
      .on('add'|'change', path → tailFile(path, broadcast))

tailFile(path, broadcast):
    prev = fileSizeCache[path] ?? 0
    cur  = stat(path).size
    if cur <= prev: return                        # 안 커졌으면 skip
    buf = read bytes [prev, cur)                  # ★ 늘어난 부분만(전체 재읽기 X)
    fileSizeCache[path] = cur
    {sessionId, origin} = resolveOriginAndSessionId(path)   # subagents/ 면 상위 uuid 가 세션
    for line in buf.split('\n'):
        ev = parser.parse(line, sessionId, origin)
        if ev && ev.category !== 'unknown':
            buffer.push(ev); if len>500 buffer.shift()      # 메모리 500개 상한
            broadcast({type:'event', payload: ev})
```

## 참고

- **클라우드에선 실시간성이 sync 주기**로 바뀐다(파일이 배치로 도착 → add/change 발생).
- 오프셋 캐시는 메모리라 서버 재시작 시 리셋(재시작 후 첫 변경은 델타만 잡음 — 히스토리는 REST 로 로드).
- 인증: WebSocket 은 `?token=` 쿼리로 검증(→ `middleware/auth`).
