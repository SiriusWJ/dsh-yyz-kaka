/**
 * 咔咔预设 · 记忆与日记（agent 作用域）。
 *
 * 这个模块只在"选了咔咔预设"的会话里挂载，所以它注册的一切——提示词章节、
 * 变量、工具——都天然只属于咔咔，别的预设看不到也调不到。
 *
 * 记忆怎么进模型：**系统提示章节 + 变量**。
 *   - `ctx.systemPrompt.section()` 只是一个静态章节骨架，正文写 `{{kaka_memory}}`；
 *   - `ctx.systemPrompt.variable()` 在每次装配时重新读文件渲染。
 * 好处：会话的第一步就能看到记忆（不像 inbox 注入要等下一个 step），
 * 且记忆没变时渲染结果完全一致，KV cache 不受影响；只有咔咔真的写了记忆，
 * 下一次装配才会变一次。代价是记忆长度每轮都占 token——和"持久消息"一样。
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

import {
  MEMORY_LIMIT,
  appendDiaryNote,
  appendMemory,
  billedChars,
  dateKey,
  ensureDirs,
  listDiaries,
  log,
  readDiary,
  readDream,
  readMemory,
  recentDreams,
  renderMemoryBlock,
  writeDream,
  writeMemory,
} from '../lib/runtime.js'

export const name = 'kaka-memory'
export const inject = ['tools', 'systemPrompt']

/** 注入章节里出现的变量名。 */
const MEMORY_VAR = 'kaka_memory'

/** 梦摘要的最大字符数：够她"有东西可讲"，又不至于吃掉记忆预算。 */
const DREAM_EXCERPT_LIMIT = 600

function excerpt(text, limit) {
  const clean = String(text ?? '').trim()
  if (clean.length <= limit) return clean
  return `${clean.slice(0, limit)}……`
}

/**
 * 渲染这一次装配要注入的记忆正文。
 * @returns {string} 永远返回字符串：变量返回 undefined 会让整个装配失败。
 */
function renderMemorySection() {
  const parts = []
  const memory = renderMemoryBlock()
  if (memory) parts.push(memory)

  try {
    const [latest] = recentDreams(1)
    if (latest) {
      parts.push(`## 最近的梦（${latest.date}）\n${excerpt(latest.text, DREAM_EXCERPT_LIMIT)}`)
    }
  } catch (err) {
    log('读取梦境失败', err?.message || err)
  }

  return parts.join('\n\n')
}

export function apply(ctx) {
  // ── 1. 每轮注入记忆 ───────────────────────────────────────────────
  ctx.systemPrompt.variable(MEMORY_VAR, () => renderMemorySection())
  ctx.systemPrompt.section({
    name: 'kaka:memory',
    // 落在第一方指引之后、persona suffix（10200）之前
    order: 10100,
    text: '{{kaka_memory}}',
  })

  // ── 2. kaka_memory ────────────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'kaka_memory',
    description: '读取或写入咔咔自己的长期记忆。这些记忆在所有咔咔会话之间共享，每次请求都会出现在你的提示里。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['read', 'append', 'replace'],
        description: 'read 读取原文；append 追加一条；replace 用 text 整体覆盖。',
      },
      target: {
        type: 'string',
        required: false,
        enum: ['agent', 'user'],
        description: 'agent（默认）是咔咔自己的长记忆 MEMORY.md；user 是主人画像 USER.md。',
      },
      text: {
        type: 'string',
        required: false,
        description: 'append 时要追加的一行（建议 `- [标签] 一句话`）；replace 时的完整新内容。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true },
          target: { type: 'string', required: true },
          chars: { type: 'integer', required: true },
          limit: { type: 'integer', required: true },
          content: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.content !== undefined
          ? `${value.target}（${value.chars}/${value.limit} 字符）：\n${value.content}`
          : `${value.target} 已${value.action === 'append' ? '追加' : '更新'}，现在 ${value.chars}/${value.limit} 字符。`,
      }],
    },
    execute(args) {
      const target = args.target === 'user' ? 'user' : 'agent'
      const action = args.action
      if (action === 'read') {
        const content = readMemory(target)
        return Promise.resolve({
          action,
          target,
          chars: content.length,
          limit: MEMORY_LIMIT,
          content,
        })
      }
      if (action === 'append') {
        const chars = appendMemory(target, args.text ?? '')
        return Promise.resolve({ action, target, chars, limit: MEMORY_LIMIT })
      }
      if (action === 'replace') {
        const chars = writeMemory(target, args.text ?? '')
        return Promise.resolve({ action, target, chars, limit: MEMORY_LIMIT })
      }
      throw new Error(`kaka_memory 不认识 action=${String(action)}`)
    },
    presentCall: args => ({ card: 'generic', title: `记忆 · ${args.action}`, kind: 'other' }),
  }))

  // ── 3. kaka_journal：读日记 ──────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'kaka_journal',
    description: '读咔咔的日记与最近的梦。不传日期读今天；也可以列出最近写过哪些天。',
    parameters: {
      date: {
        type: 'string',
        required: false,
        description: 'YYYY-MM-DD；省略则读今天。传 "list" 列出最近 14 天。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true },
          date: { type: 'string' },
          text: { type: 'string' },
          days: { type: 'array', items: { type: 'string' } },
          dreams: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.kind === 'list'
          ? `日记：${(value.days || []).join(', ') || '（空）'}\n梦：${(value.dreams || []).join(', ') || '（空）'}`
          : `${value.date} 的日记：\n${value.text || '（这一天还没有日记）'}`,
      }],
    },
    execute(args) {
      if (String(args.date || '').trim() === 'list') {
        return Promise.resolve({
          kind: 'list',
          days: listDiaries(14),
          dreams: recentDreams(7).map(item => item.date),
        })
      }
      const day = String(args.date || '').trim()
      const date = day ? new Date(`${day}T12:00:00`) : new Date()
      if (Number.isNaN(date.getTime())) throw new Error('日期格式要写成 YYYY-MM-DD')
      return Promise.resolve({ kind: 'day', date: dateKey(date), text: readDiary(date) })
    },
    presentCall: () => ({ card: 'generic', title: '翻日记', kind: 'other' }),
  }))

  // ── 4. kaka_diary：写手记 ────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'kaka_diary',
    description: '在今天日记的「手记」里写一句自己的话。第一人称、带点情绪，不要写项目路径。',
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: '要写进手记的内容，一两句话即可。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: { type: 'string', required: true },
          chars: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `写进 ${value.date} 的手记了（${value.chars} 字符）。` }],
    },
    execute(args) {
      const text = String(args.text ?? '').trim()
      if (!text) throw new Error('手记不能是空的')
      ensureDirs()
      appendDiaryNote(text)
      return Promise.resolve({ date: dateKey(), chars: text.length })
    },
    presentCall: () => ({ card: 'generic', title: '写手记', kind: 'other' }),
  }))

  // ── 5. kaka_dream：写梦 ──────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'kaka_dream',
    description: '写下今晚的梦（第一人称的叙事，不是工作汇报），会存进 dreams 目录并在下次会话里出现在提示中。',
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: '梦的正文。300～600 字，像真的在说梦话，不要用列表符号。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: { type: 'string', required: true },
          chars: { type: 'integer', required: true },
          billed: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `梦记下了（${value.date}，${value.chars} 字符）。` }],
    },
    execute(args) {
      const text = String(args.text ?? '').trim()
      if (!text) throw new Error('梦不能是空的')
      ensureDirs()
      writeDream(`# ${dateKey()} 的梦\n\n${text}\n`)
      return Promise.resolve({ date: dateKey(), chars: text.length, billed: billedChars(text) })
    },
    presentCall: () => ({ card: 'generic', title: '做梦', kind: 'other' }),
  }))

  // 读一次旧梦，保证目录存在（首次运行时不会报错）
  try {
    readDream()
  } catch { /* 忽略 */ }
}
