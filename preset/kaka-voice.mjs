/**
 * 咔咔预设 · 嗓子与心情（agent 作用域）。
 *
 * 四个工具都只注册在咔咔预设里：别的预设的模型根本看不到它们。
 *   kaka_say    用 DeepSeek 官方 TTS 说话（要花钱，单条有字符上限）
 *   kaka_beep   免费提示音
 *   kaka_mood   切心情/动作，可顺带说一句
 *   kaka_remind 给自己订个闹钟（存进生命线程的事件表，重启不丢）
 */

import { loadDshPackage } from '../lib/dsh-modules.js'
import {
  beep,
  currentMood,
  getSettings,
  log,
  pushMood,
  scheduleEvent,
  synthesize,
  voiceAvailable,
} from '../lib/runtime.js'

export const name = 'kaka-voice'
export const inject = ['tools', 'systemPrompt']

const VOICES = ['stella', 'tide']
const MOODS = ['idle', 'focus', 'proud', 'worried', 'tired', 'dreaming', 'petted', 'sleeping', 'drawing']
const BEEP_KINDS = ['done', 'question', 'error', 'attention', 'pet']

/** 取本会话最后一条助手正文，作为 kaka_say 的默认朗读内容。 */
function lastAssistantText(agent) {
  try {
    const messages = agent?.session?.deriveMessages?.() || []
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i]
      if (message?.role !== 'assistant') continue
      const blocks = Array.isArray(message.content) ? message.content : []
      const text = blocks
        .filter(block => block?.type === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join('\n')
        .trim()
      if (text) return text
    }
  } catch (err) {
    log('读取上一条回复失败', err?.message || err)
  }
  return ''
}

/** 解析闹钟时间：支持 "HH:mm"、"YYYY-MM-DD HH:mm"、ISO 字符串、或"多少分钟后"。 */
function resolveReminderTime(args) {
  const now = Date.now()
  if (Number.isFinite(Number(args.afterMinutes)) && Number(args.afterMinutes) > 0) {
    return now + Number(args.afterMinutes) * 60000
  }
  const at = String(args.at || '').trim()
  if (!at) return 0
  const hm = /^(\d{1,2}):(\d{2})$/.exec(at)
  if (hm) {
    const date = new Date()
    date.setHours(Number(hm[1]), Number(hm[2]), 0, 0)
    if (date.getTime() <= now) date.setDate(date.getDate() + 1)
    return date.getTime()
  }
  const parsed = Date.parse(at)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function apply(ctx) {
  const { defineTool } = await loadDshPackage('@deepseek-ai/dsh-tools')

  // ── 0. 把"嗓子当前状态"告诉模型：让设置面板上的开关真的影响行为 ──
  ctx.systemPrompt.variable('kaka_voice_rules', () => {
    const settings = getSettings()
    const lines = ['## 嗓子（当前设置）']
    lines.push(`- 自动朗读：${settings.voice.autoRead ? '开——重要节点可以自己开口' : '关——只有主人点名时才说话'}`)
    lines.push(`- 单条上限：${settings.voice.maxBilledChars} 计费字符（超出只念首句）`)
    lines.push(`- 提示音档位：${{ off: '禁用', important: '重要', always: '每次' }[settings.notify.level] || '重要'}`)
    if (!voiceAvailable()) {
      lines.push('- ⚠️ 当前进程没有 DEEPSEEK_API_KEY：kaka_say 会失败，别尝试说话，用文字或 kaka_beep 代替。')
    }
    return lines.join('\n')
  })
  ctx.systemPrompt.section({
    name: 'kaka:voice-rules',
    order: 10101,
    text: '{{kaka_voice_rules}}',
  })

  // ── 1. kaka_say ──────────────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'kaka_say',
    description: '用嗓子把一句话念给主人听（DeepSeek 官方语音合成，按字符计费）。代码块、表格、链接会被跳过；单条超过上限时只念首句。',
    parameters: {
      text: {
        type: 'string',
        description: '要念的内容；省略就念你上一条回复。只念真正值得主人听的那一句，不要整篇念。',
      },
      voice: {
        type: 'string',
        enum: VOICES,
        description: '音色：stella（女声，默认）或 tide（男声）。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cached: { type: 'boolean', required: true },
          billedChars: { type: 'integer', required: true },
          spoken: { type: 'string', required: true },
          audioUrl: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.cached
          ? `念了（命中缓存，不花钱）：${value.spoken}`
          : `念了（${value.billedChars} 计费字符）：${value.spoken}`,
      }],
    },
    async execute(args, exec) {
      const text = String(args.text ?? '').trim() || lastAssistantText(exec.agent)
      if (!text) throw new Error('没有可念的内容：请把要念的那句话作为 text 传进来')
      const result = await synthesize({ text, voiceId: args.voice, signal: exec.signal, session: exec.agent?.id })
      return {
        cached: result.cached,
        billedChars: result.billedChars,
        spoken: result.spoken,
        audioUrl: result.audioUrl,
      }
    },
    presentCall: args => ({ card: 'generic', title: '咔咔说话', kind: 'other', rawInput: args.text ? String(args.text).slice(0, 120) : '' }),
  }))

  // ── 2. kaka_beep ─────────────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'kaka_beep',
    description: '播放一个提示音（不联网、不花钱）。用于抓住主人的注意力，只响一声。',
    parameters: {
      kind: {
        type: 'string',
        enum: BEEP_KINDS,
        description: 'done 完成 · question 需要主人回答 · error 出错 · attention 提醒 · pet 被摸。默认 done。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { sound: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: `响了提示音 ${value.sound}。` }],
    },
    execute(args, exec) {
      const result = beep(args.kind || 'done', exec.agent?.id)
      return Promise.resolve({ sound: result.sound })
    },
    presentCall: args => ({ card: 'generic', title: `提示音 ${args.kind || 'done'}`, kind: 'other' }),
  }))

  // ── 3. kaka_mood ─────────────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'kaka_mood',
    description: '切换你此刻的心情与动作，让主人从宠物动画上看出你的状态。可以顺带说一句话。',
    parameters: {
      mood: {
        type: 'string',
        required: true,
        enum: MOODS,
        description: 'idle 元气 · focus 专注 · proud 得意 · worried 担心 · tired 疲惫 · dreaming 做梦 · petted 被摸 · sleeping 睡觉。',
      },
      action: {
        type: 'string',
        description: '可选的小动作名，例如 claw / wiggle / celebrate / shake / doze / sleep / writing。',
      },
      speech: {
        type: 'string',
        description: '可选：顺带念出来的一句话（会调用语音合成并计费）。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          mood: { type: 'string', required: true },
          action: { type: 'string', required: true },
          spoken: { type: 'boolean', required: true },
          note: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `现在是 ${value.mood}${value.action ? `（${value.action}）` : ''}。${value.note || ''}`,
      }],
    },
    async execute(args, exec) {
      const snapshot = pushMood(args.mood, args.action || '', { session: exec.agent?.id })
      let spoken = false
      let note = ''
      const speech = String(args.speech ?? '').trim()
      if (speech) {
        try {
          await synthesize({ text: speech, signal: exec.signal, session: exec.agent?.id })
          spoken = true
        } catch (err) {
          note = `（想说话但没成功：${err?.message || err}）`
          log('kaka_mood 顺带说话失败', err?.message || err)
        }
      }
      // 注意：输出必须是"无损 JSON"——不能带 undefined，否则 DSH 会判 INVALID_TOOL_OUTPUT。
      const output = { mood: snapshot.name, action: snapshot.action, spoken }
      if (note) output.note = note
      return output
    },
    presentCall: args => ({ card: 'generic', title: `心情 · ${args.mood}`, kind: 'other' }),
  }))

  // ── 4. kaka_remind ───────────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'kaka_remind',
    description: '给自己订一个闹钟：到点会响提示音，并（默认）把这件事投递回你，由你开口提醒主人。闹钟存在生命线程里，重启不会丢。',
    parameters: {
      at: {
        type: 'string',
        description: '绝对时间："HH:mm"（今天或明天）或 ISO 字符串。与 afterMinutes 二选一。',
      },
      afterMinutes: {
        type: 'number',
        description: '多少分钟后。',
      },
      what: {
        type: 'string',
        required: true,
        description: '到点要提醒的内容，一句话。',
      },
      mode: {
        type: 'string',
        enum: ['notify', 'prompt'],
        description: 'notify 只响提示音；prompt（默认）还会把提醒投递给你，由你开口说。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dueAt: { type: 'string', required: true },
          minutes: { type: 'integer', required: true },
          what: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.minutes} 分钟后（${value.dueAt}）提醒：${value.what}`,
      }],
    },
    execute(args) {
      const dueAt = resolveReminderTime(args)
      if (!dueAt) throw new Error('时间没看懂：给 afterMinutes，或者 at="HH:mm" / ISO 时间')
      const what = String(args.what ?? '').trim()
      if (!what) throw new Error('要提醒什么？what 不能是空的')
      const mode = args.mode === 'notify' ? 'notify' : 'prompt'
      scheduleEvent('reminder', dueAt, { what, mode })
      const minutes = Math.max(1, Math.round((dueAt - Date.now()) / 60000))
      return Promise.resolve({
        dueAt: new Date(dueAt).toISOString(),
        minutes,
        what,
      })
    },
    presentCall: args => ({ card: 'generic', title: `闹钟 · ${args.what || ''}`.slice(0, 80), kind: 'other' }),
  }))

  // 暴露当前心情给调试用（不注册工具）
  void currentMood
}
