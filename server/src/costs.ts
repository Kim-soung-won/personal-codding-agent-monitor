import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { CostEntry } from './types.js'

export async function readCosts(baseDir?: string): Promise<CostEntry[]> {
  const dir = baseDir ?? join(homedir(), '.claude', 'metrics')
  const filePath = join(dir, 'costs.jsonl')

  let text: string
  try {
    text = await readFile(filePath, 'utf8')
  } catch {
    return []
  }

  const results: CostEntry[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const entry = JSON.parse(trimmed) as CostEntry
      results.push(entry)
    } catch {
      // malformed line — skip
    }
  }
  return results
}
