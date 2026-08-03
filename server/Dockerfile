# 빌드 컨텍스트는 저장소 루트여야 한다(shared/ 를 참조하므로).
#   docker build -f server/Dockerfile -t observer-server .
#
# HTTPS/WSS 종단은 호스팅 플랫폼의 리버스 프록시/로드밸런서에 위임한다.
# 이 컨테이너는 평문 HTTP 로 리슨한다.

# ── build stage ──────────────────────────────────────────────
# glibc 이미지 사용: Prisma 엔진이 glibc 용 prebuilt 바이너리를 제공한다.
# (Alpine/musl 은 openssl 계열 추가 설정이 필요하다)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install
COPY shared/ ./shared/
COPY server/ ./server/
# build 스크립트가 `prisma generate` 를 먼저 돌린다(schema.prisma 가 복사된 뒤여야 한다).
RUN cd server && npm run build

# ── runtime stage ────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY --from=build /app/server/dist ./server/dist
# 생성된 Prisma 클라이언트는 build 스테이지에서 가져온다. prisma CLI 가 devDependency 라
# `--omit=dev` 한 런타임에서는 generate 를 다시 돌릴 수 없기 때문이다.
COPY --from=build /app/server/node_modules/.prisma ./server/node_modules/.prisma
COPY --from=build /app/server/node_modules/@prisma ./server/node_modules/@prisma
# 마이그레이션 파일 — 배포 시 `npx prisma migrate deploy` 를 돌릴 때 필요하다.
COPY server/prisma ./server/prisma
WORKDIR /app/server
EXPOSE 3001
# DATABASE_URL(런타임 pooler) 과 DIRECT_URL(마이그레이션 직결) 은 둘 다 필수.
# 스키마 적용은 컨테이너 기동이 아니라 배포 파이프라인에서 한다.
CMD ["node", "dist/server/src/index.js"]
