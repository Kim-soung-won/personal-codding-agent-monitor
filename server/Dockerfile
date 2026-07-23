# 빌드 컨텍스트는 저장소 루트여야 한다(shared/ 를 참조하므로).
#   docker build -f server/Dockerfile -t observer-server .
#
# HTTPS/WSS 종단은 호스팅 플랫폼의 리버스 프록시/로드밸런서에 위임한다.
# 이 컨테이너는 평문 HTTP 로 리슨한다.

# ── build stage ──────────────────────────────────────────────
# glibc 이미지 사용: better-sqlite3 의 prebuilt 바이너리가 존재해 네이티브 컴파일 불필요.
# (Alpine/musl 은 소스 빌드가 필요해 build-essential 추가로 이미지가 커진다)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install
COPY shared/ ./shared/
COPY server/ ./server/
RUN cd server && npm run build

# ── runtime stage ────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY --from=build /app/server/dist ./server/dist
WORKDIR /app/server
EXPOSE 3001
# 데이터 볼륨(동기화된 세션 파일)은 CLAUDE_DATA_DIR 로 마운트한다.
CMD ["node", "dist/server/src/index.js"]
