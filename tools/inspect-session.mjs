/**
 * 会话验收器：直接读会话日志（zstd 压缩的 JSONL），回答四个问题：
 *   1. 这个会话选的是哪个预设？
 *   2. 模型实际拿到了哪些工具（尤其 kaka_* 在不在）？
 *   3. 有没有被注入 AGENTS.md（咔咔会话应该一条都没有）？
 *   4. 咔咔的回复长什么样（人格有没有生效）？
 *
 * 用法：
 *   node tools/inspect-session.mjs                # 自动找最新的会话
 *   node tools/inspect-session.mjs <sessionDir>   # 指定会话目录
 *   node tools/inspect-session.mjs <sessionDir> --watch
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { zstdDecompressSync } from 'node:zlib'
import { Readable } from 'node:stream'


const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')

function findNewestSession() {
  const root = join(DSH_HOME, 'sessions')
  const candidates = []
  for (const workspace of readdirSync(root)) {
    const dir = join(root, workspace)
    let entries = []
    try { entries = readdirSync(dir) } catch { continue }
    for (const entry of entries) {
      const file = join(dir, entry, 'session.v4.jsonl.zstd')
      try {
        candidates.push({ file, mtime: statSync(file).mtimeMs, workspace })
      } catch { /* 不是会话目录 */ }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime)
  return candidates[0]
}

/** 按会话 id 找目录（会话 id 形如 session-xxxxxxxx-...）。 */
function findBySessionId(sessionId) {
  const root = join(DSH_HOME, 'sessions')
  for (const workspace of readdirSync(root)) {
    const file = join(root, workspace, sessionId, 'session.v4.jsonl.zstd')
    try {
      statSync(file)
      return { file, workspace }
    } catch { /* 继续找 */ }
  }
  return null
}

/**
 * 解压整份会话日志。
 *
 * 会话文件是"边写边追加"的多帧 zstd：Node 的流式解码器只解第一帧就停了，
 * 所以这里按 zstd magic（28 B5 2F FD）切帧，逐帧同步解压；某一帧解不开说明
 * 切错了位置，就把它并进下一段重试。
 */
function inflate(raw) {
  const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
  const starts = []
  for (let i = 0; i + 3 < raw.length; i += 1) {
    if (raw[i] === MAGIC[0] && raw[i + 1] === MAGIC[1] && raw[i + 2] === MAGIC[2] && raw[i + 3] === MAGIC[3]) {
      starts.push(i)
    }
  }
  if (!starts.length) return raw.toString('utf8')

  const parts = []
  for (let index = 0; index < starts.length; index += 1) {
    let merged = false
    for (let end = index + 1; end <= starts.length; end += 1) {
      const stop = end < starts.length ? starts[end] : raw.length
      try {
        parts.push(zstdDecompressSync(raw.subarray(starts[index], stop)).toString('utf8'))
        index = end - 1
        merged = true
        break
      } catch {
        // 这一帧可能被 magic 误切，试着把下一段并进来
        continue
      }
    }
    if (!merged) break
  }
  return parts.join('')
}

function readEvents(file) {
  const raw = readFileSync(file)
  const text = file.endsWith('.zstd') ? inflate(raw) : raw.toString('utf8')
  const events = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try { events.push(JSON.parse(trimmed)) } catch { /* 跳过坏行 */ }
  }
  return events
}

function textOf(message) {
  const blocks = Array.isArray(message?.content) ? message.content : []
  return blocks.filter(b => b?.type === 'text').map(b => b.text).join('\n').trim()
}

async function main() {
  const explicit = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : ''
  const target = explicit
    ? (explicit.startsWith('session-')
      ? findBySessionId(explicit)
      : { file: join(explicit, 'session.v4.jsonl.zstd'), workspace: '(explicit)' })
    : findNewestSession()

  if (!target) {
    console.log('没有找到任何会话')
    return
  }

  const events = readEvents(target.file)
  // 第一行是会话头：{"type":"session","version":4,"agentPreset":"kaka",...}
  const headerEvent = events.find(event => event?.type === 'session') || {}
  const header = headerEvent?.data?.header || headerEvent || {}

  console.log('会话文件 :', target.file)
  console.log('事件数   :', events.length)
  console.log('预设     :', header.agentPreset ?? '(未记录)')

  const toolSchemas = new Set()
  for (const event of events) {
    const tools = event?.data?.header?.tools
    if (event?.type === 'request/header' && Array.isArray(tools)) {
      for (const tool of tools) toolSchemas.add(tool.name)
    }
  }
  const kakaTools = [...toolSchemas].filter(name => name.startsWith('kaka_')).sort()
  console.log('工具总数 :', toolSchemas.size)
  console.log('kaka_*   :', kakaTools.length ? kakaTools.join(', ') : '(无)')

  const texts = []
  for (const event of events) {
    const message = event?.data?.message
    if (!message) continue
    const text = textOf(message)
    if (text) texts.push({ role: message.role, text })
  }

  const agentsHits = texts.filter(item => item.text.includes('Instructions from:') || item.text.includes('<user-global-instructions>'))
  console.log('AGENTS.md 注入次数 :', agentsHits.length, agentsHits.length ? '（咔咔会话应为 0）' : '✅')

  const personaHits = texts.filter(item => /钳子|咔嚓|咔咔/.test(item.text))
  console.log('人格关键词出现次数 :', personaHits.length)

  const systemTexts = texts.filter(item => item.role === 'system' || item.role === 'developer')
  const memoryHit = systemTexts.filter(item => item.text.includes('咔咔的记忆'))
  console.log('记忆块注入次数 :', memoryHit.length)

  const assistants = texts.filter(item => item.role === 'assistant').slice(-3)
  console.log('\n最近几条助手回复：')
  for (const item of assistants) {
    console.log('---')
    console.log(item.text.slice(0, 400))
  }

  const calls = events.filter(e => e?.type === 'tool/call').map(e => e.data?.name).filter(Boolean)
  console.log('\n工具调用记录 :', calls.length ? calls.join(', ') : '(无)')
}

main()
