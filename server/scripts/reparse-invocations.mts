/**
 * 일회성 재파싱 — 기존 레코드의 rawMarkdown 을 새 파서로 다시 읽어 ToolInvocation 을 재생성한다.
 * plugin 채우기(parser 수정) 를 기존 적재분에 소급 적용하려는 목적. ToolInvocation 만 건드리고
 * 다른 자식 행(agent·signal·feedback·hygiene)은 그대로 둔다. 멱등 — 여러 번 돌려도 안전하다.
 *
 * 실행: npx tsx scripts/reparse-invocations.mts
 */
import { PrismaClient } from '@prisma/client'
import { parseRecord } from '../src/agent-factory/record-parser.js'

const prisma = new PrismaClient()

async function main() {
  const records = await prisma.commitRecord.findMany({
    select: { id: true, commitSha: true, rawMarkdown: true },
  })
  console.log(`재파싱 대상: ${records.length}건`)

  let touched = 0
  let pluginRows = 0
  for (const rec of records) {
    if (!rec.rawMarkdown) continue
    const parsed = parseRecord(rec.rawMarkdown)
    const withPlugin = parsed.invocations.filter((i) => i.plugin).length

    await prisma.$transaction([
      prisma.toolInvocation.deleteMany({ where: { recordId: rec.id } }),
      ...(parsed.invocations.length > 0
        ? [
            prisma.toolInvocation.createMany({
              data: parsed.invocations.map((i) => ({ recordId: rec.id, ...i })),
            }),
          ]
        : []),
    ])
    touched++
    pluginRows += withPlugin
    if (withPlugin > 0) {
      console.log(`  ${rec.commitSha.slice(0, 7)}: invocation ${parsed.invocations.length}건, plugin ${withPlugin}건`)
    }
  }
  console.log(`\n완료: ${touched}건 재파싱, plugin 채워진 invocation ${pluginRows}건`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
