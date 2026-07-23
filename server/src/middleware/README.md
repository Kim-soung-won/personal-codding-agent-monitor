# `server/src/middleware/` — 인증

단일 토큰(`AUTH_TOKEN`) 기반. REST 는 헤더, WebSocket 은 쿼리로 검증. 토큰은 상수 시간 비교.

```
createAuthMiddleware(expectedToken) → Express 미들웨어:
    provided = Bearer 헤더에서 추출
    if !provided || !timingSafeEqual(provided, expectedToken):
        → 401 {success:false, error:'unauthorized'}
    else next()

isWsAuthorized(reqUrl, expectedToken) → boolean:
    token = new URL(reqUrl).searchParams.get('token')     # WS 는 헤더 못 쓰므로 ?token=
    return timingSafeEqual(token, expectedToken)
```

## 적용 지점 (`index.ts`)

```
app.use('/api', createAuthMiddleware(AUTH_TOKEN))         # /api 전체(정적 페이지 없음)
wss.on('connection', (ws, req) =>                          # WebSocket 업그레이드
    if !isWsAuthorized(req.url, AUTH_TOKEN): ws.close(4401)
)
# ★ AUTH_TOKEN 미설정 시 index.ts 가 process.exit(1) — 인증 없이 뜨는 사고 방지
```

> 길이가 다른 토큰도 `timingSafeEqual`(Buffer 길이 선검사)로 안전 거부. 단일 사용자용 최소 방어선 —
> 팀/공개 확장 시 계정 기반 인증으로 승격 고려(현재 범위 밖).
