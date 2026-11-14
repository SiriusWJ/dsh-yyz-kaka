/**
 * 咔咔预设 · 声音与心情（agent 作用域）。
 *
 * 只注册在咔咔预设里：别的预设的模型根本看不到它们。
 *   kaka_beep   螃蟹声（咔嚓 / 叩壳 / 咕噜 / 吱吱…），免费、本地合成
 *   kaka_mood   切心情/动作，可顺带说一句
 *   kaka_remind 给自己订个闹钟（存进生命线程的事件表，重启不丢）
 */

import { loadDshPackage } from '../lib/dsh-modules.js'
import {
  beep,
  currentMood,
  getSettings,
  log,
  pushBubble,
  pushMood,
  scheduleEvent,
} from '../lib/runtime.js'

export const name = 'kaka-voice'
export const inject = ['tools', 'systemPrompt']

const MOODS = ['idle', 'focus', 'proud', 'worried', 'tired', 'dreaming', 'petted', 'sleeping', 'drawing']
const BEEP_KINDS = ['done', 'question', 'error', 'attention', 'pet']
const SFX_NAMES = ['clack', 'clack2', 'knock', 'bubble', 'scuttle', 'chirp']

/** 情绪 → 音色与速度：让她"有情绪地叫"。 */
const EMOTION_SFX = {
  happy: { name: 'clack2', pitch: 1.15, speed: 1.2 },
  excited: { name: 'clack2', pitch: 1.32, speed: 1.5 },
  annoyed: { name: 'knock', pitch: 0.96, speed: 1.15 },
  tired: { name: 'knock', pitch: 0.78, speed: 0.7 },
  curious: { name: 'chirp', pitch: 1.1, speed: 1 },
  scared: { name: 'chirp', pitch: 1.4, speed: 1.45 },
  calm: { name: 'bubble', pitch: 1, speed: 0.9 },
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

  // ── 0. 声音规则：只有螃蟹声，没有人声 ──
  ctx.systemPrompt.variable('kaka_voice_rules', () => {
    const settings = getSettings()
    const lines = ['## 你的声音', '- 你不能说话（没有 TTS），只能发出螃蟹的声音：钳子咔嚓、壳上叩响、气泡咕噜、沙沙爬、吱吱。', '- kaka_beep 是你的叫声：done=咔嚓咔嚓（干完活）、attention=咔嚓（叫主人）、question=吱吱、error=叩壳、pet=咕噜.', `- 提示音档位：${{ off: '禁用', important: '重要', always: '每次' }[settings.notify.level] || '重要'}`, '- 想表达情绪就用 kaka_mood（换表情和动作），不要试图用声音说人话。']
    return lines.join('\n')
  })
  ctx.systemPrompt.section({
    name: 'kaka:voice-rules',
    order: 10101,
    text: '{{kaka_voice_rules}}',
  })

  // ── 2. kaka_beep ─────────────────────────────────────────────────
  // ── 1. kaka_beep：发出螃蟹的声音（可选情绪预设，也能自己调音） ──
  ctx.tools.register(defineTool({
    name: 'kaka_beep',
    description: '发出螃蟹的声音（咔嚓/叩壳/咕噜/沙沙爬/吱吱）。可以选情绪预设，也可以自己调音高与速度，做出属于你的叫法。',
    parameters: {
      kind: {
        type: 'string',
        enum: BEEP_KINDS,
        description: '事件档位：done=干完活、attention=叫主人、question=问一句、error=出错、pet=被摸。不填默认 done。',
      },
      sound: {
        type: 'string',
        enum: SFX_NAMES,
        description: '直接指定螃蟹声：clack=咔嚓、clack2=咔嚓咔嚓、knock=叩壳、bubble=咕噜、scuttle=沙沙爬、chirp=吱吱。',
      },
      emotion: {
        type: 'string',
        enum: Object.keys(EMOTION_SFX),
        description: '情绪预设（会覆盖 sound 的音色与速度）：happy 开心、excited 兴奋、annoyed 不满、tired 累、curious 好奇、scared 受惊、calm 平静。',
      },
      pitch: { type: 'number', description: '音高倍数 0.5～2（<1 更闷，>1 更尖）' },
      speed: { type: 'number', description: '速度倍数 0.5～2（<1 更慢）' },
      volume: { type: 'number', description: '音量 0～1，默认 1' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sound: { type: 'string', required: true },
          pitch: { type: 'number', required: true },
          speed: { type: 'number', required: true },
          volume: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `叫了一声：${value.sound}（音高 ×${value.pitch}，速度 ×${value.speed}）`,
      }],
    },
    execute(args, exec) {
      const chosen = args.emotion && EMOTION_SFX[args.emotion]
      const sound = args.sound || (chosen && chosen.name) || ''
      const options = {
        name: sound || undefined,
        pitch: Number(args.pitch) || (chosen && chosen.pitch) || 1,
        speed: Number(args.speed) || (chosen && chosen.speed) || 1,
        volume: Number(args.volume) || 1,
      }
      const result = beep(args.kind || 'done', exec?.agent?.id || '', options)
      log('叫了一声', options.name || result.sound, 'pitch', options.pitch, 'speed', options.speed)
      return {
        sound: options.name || result.sound,
        pitch: options.pitch,
        speed: options.speed,
        volume: options.volume,
      }
    },
    presentCall: () => ({ card: 'generic', title: '叫一声', kind: 'other' }),
  }))
  ctx.tools.register(defineTool({
    name: 'kaka_mood',
    description: '切换你此刻的心情与动作，让主人从宠物动画上看出你的状态。可以顺带在头顶冒一句话（气泡，不出声）。',
    parameters: {
      mood: {
        type: 'string',
        required: true,
        enum: MOODS,
        description: 'idle 元气 · focus 专注 · proud 得意 · worried 担心 · tired 疲惫 · dreaming 入睡整理记忆 · petted 被摸 · sleeping 睡觉。',
      },
      action: {
        type: 'string',
        description: '可选的小动作名，例如 claw / wiggle / celebrate / shake / doze / sleep / writing。',
      },
      speech: {
        type: 'string',
        description: '可选：顺带在她头顶冒的一句话（纯文字气泡，不出声、不花钱）。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          mood: { type: 'string', required: true },
          action: { type: 'string', required: true },
          note: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `现在是 ${value.mood}${value.action ? `（${value.action}）` : ''}。${value.note || ''}`,
      }],
    },
    execute(args, exec) {
      const snapshot = pushMood(args.mood, args.action || '', { session: exec.agent?.id })
      let note = ''
      const speech = String(args.speech ?? '').trim()
      if (speech) {
        // 没有 TTS：只在头顶冒气泡文字，不出声
        pushBubble(speech, exec.agent?.id)
        note = '（头顶冒了一句）'
      }
      // 注意：输出必须是"无损 JSON"——不能带 undefined，否则 DSH 会判 INVALID_TOOL_OUTPUT。
      const output = { mood: snapshot.name, action: snapshot.action }
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
