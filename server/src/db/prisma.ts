import { PrismaClient } from '@prisma/client'

/**
 * Prisma 싱글턴.
 *
 * tsx watch 는 파일 변경마다 모듈 그래프를 다시 평가하므로, 매번 새 PrismaClient 를
 * 만들면 커넥션 풀이 누적돼 Postgres 의 max_connections 를 먹는다. globalThis 에
 * 캐시해 dev 리로드 사이에 인스턴스를 공유한다(프로덕션은 프로세스가 1회만 뜨므로 무관).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
