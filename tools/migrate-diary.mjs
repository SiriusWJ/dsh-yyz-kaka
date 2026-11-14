/**
 * 一次性迁移：把旧格式日记（`## 流水` + `## 手记`）拆成
 *   diary/YYYY-MM-DD.md    只有散文正文
 *   journal/YYYY-MM-DD.md  机械素材
 *
 * 用法：node tools/migrate-diary.mjs [DSH_HOME]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DSH_HOME = process.argv[2] || process.env.DSH_HOME || join(homedir(), '.dsh')
const KAKA = join(DSH_HOME, 'kaka')
const DIARY = join(KAKA, 'diary')
const JOURNAL = join(KAKA, 'journal')

if (!existsSync(KAKA)) {
  console.log('没有找到 kaka 数据目录，跳过')
  process.exit(0)
}
mkdirSync(JOURNAL, { recursive: true })

let migrated = 0
for (const name of readdirSync(DIARY)) {
  if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) continue
  const file = join(DIARY, name)
  const text = readFileSync(file, 'utf8')
  if (!text.includes('## 流水') && !text.includes('## 手记')) continue

  const day = name.slice(0, 10)
  const flowMatch = /## 流水\s*\n([\s\S]*?)(?=\n## 手记|$)/.exec(text)
  const noteMatch = /## 手记\s*\n([\s\S]*)$/.exec(text)

  const flowLines = (flowMatch ? flowMatch[1] : '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.replace(/^-\s*/, ''))

  const notes = (noteMatch ? noteMatch[1] : '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.replace(/^-\s*\d{1,2}:\d{2}\s*/, '').replace(/^-\s*/, ''))
    .filter(Boolean)

  writeFileSync(file, `# ${day} 咔咔的日记\n\n${notes.join('\n\n')}\n`, 'utf8')
  if (flowLines.length) {
    writeFileSync(join(JOURNAL, name), `# ${day} 素材\n\n${flowLines.map(line => `- ${line}`).join('\n')}\n`, 'utf8')
  }
  migrated += 1
  console.log(`migrated ${name}: ${notes.length} 段正文, ${flowLines.length} 条素材`)
}

console.log(`done, ${migrated} file(s)`)
