/**
 * 咔咔（Kaka）宿主运行时 —— 进程级单例。
 *
 * 这一份模块被三处共享：
 *   1. `lib/index.js`（宿主插件本体：路由 + 生命线程）；
 *   2. `preset/kaka-memory.mjs`（预设作用域：提示词注入 + kaka_memory 工具）；
 *   3. `preset/kaka-voice.mjs`（预设作用域：kaka_say / kaka_beep / kaka_mood / kaka_remind / kaka_diary）。
 *
 * 三者同在一个 Node 进程里，模块缓存保证拿到同一份状态。所以这里**不放任何
 * 与某个会话绑定的东西**：会话相关的注册（工具、提示词、监听器）全部由预设插件
 * 挂在 agent 作用域上，这里只负责"咔咔的生命"——记忆、日记、梦境、嗓子、心情、事件表。
 *
 * 数据全部落在 `$DSH_HOME/kaka/`，卸载插件不删数据：
 *   MEMORY.md / USER.md / diary/*.md / dreams/*.md / audio/*.wav
 *   state.json（活动时间、事件表、日记与梦的进度、计费）
 *   settings.json（设置面板写入）
 */

import {
  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync, readdirSync, unlinkSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

// ---------------------------------------------------------------- 路径与日志

const PLUGIN_ID = 'dsh-yyz-kaka'

/** DSH 家目录；与 @deepseek-ai/dsh-home-paths 保持同一套解析顺序（环境变量优先）。 */
export const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')

/** 咔咔的私人小窝。 */
export const KAKA_DIR = join(DSH_HOME, 'kaka')
export const MEMORY_FILE = join(KAKA_DIR, 'MEMORY.md')
export const USER_FILE = join(KAKA_DIR, 'USER.md')
export const DIARY_DIR = join(KAKA_DIR, 'diary')
export const DREAMS_DIR = join(KAKA_DIR, 'dreams')
export const AUDIO_DIR = join(KAKA_DIR, 'audio')
export const STATE_FILE = join(KAKA_DIR, 'state.json')
export const SETTINGS_FILE = join(KAKA_DIR, 'settings.json')

/** 单份记忆注入的上限字符数；超出部分截断并提示咔咔自己整理。 */
export const MEMORY_LIMIT = 8000

/** 统一的日志出口：宿主日志里一眼能认出是谁在说话。 */
export function log(...args) {
  // eslint-disable-next-line no-console
  console.error(`[${PLUGIN_ID}]`, ...args)
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/** 确保所有数据目录存在（幂等，可在任意入口调用）。 */
export function ensureDirs() {
  for (const dir of [KAKA_DIR, DIARY_DIR, DREAMS_DIR, AUDIO_DIR]) ensureDir(dir)
}

// ---------------------------------------------------------------- 基础工具

/** 原子写：先写临时文件再 rename，避免进程被杀时留下半个文件。 */
function writeAtomic(file, text) {
  ensureDir(dirname(file))
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, text, 'utf8')
  renameSync(tmp, file)
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

/** 本地时区的 YYYY-MM-DD（不能用 UTC，否则作息窗口会错位）。 */
export function dateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 本地时区的 HH:mm。 */
export function clockKey(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function sha1(text) {
  return createHash('sha1').update(text, 'utf8').digest('hex')
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// ---------------------------------------------------------------- 设置

export const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  pet: {
    enabled: true,
    size: 80,
    side: 'left',
    moodAuto: true,
    ramble: true,
  },
  voice: {
    voiceId: 'stella',
    volume: 0.6,
    autoRead: true,
    cache: true,
    /** 单条朗读的计费字符上限；超出只念首句。 */
    maxBilledChars: 200,
  },
  notify: {
    /** off | important | always */
    level: 'important',
  },
  life: {
    enabled: true,
    windowStart: '00:00',
    windowEnd: '08:00',
    /** 窗口内连续多少小时无活动进入"写日记"。 */
    idleHours: 3,
    tickMs: 5000,
    diary: true,
    dreamMemory: true,
    dreamCompose: true,
    rambleMinMinutes: 20,
  },
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mergeDeep(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key]
    out[key] = current && typeof current === 'object' && !Array.isArray(current) && value && typeof value === 'object' && !Array.isArray(value)
      ? mergeDeep(current, value)
      : value
  }
  return out
}

let settingsCache = null

/** 读取设置（带内存缓存）。文件损坏时回退默认值，绝不让插件因为一个坏 JSON 挂掉。 */
export function getSettings() {
  if (settingsCache) return settingsCache
  ensureDirs()
  let stored = {}
  try {
    stored = JSON.parse(readText(SETTINGS_FILE) || '{}')
  } catch {
    log('settings.json 解析失败，使用默认设置')
    stored = {}
  }
  const merged = mergeDeep(clone(DEFAULT_SETTINGS), stored)
  merged.pet.size = clampNumber(merged.pet.size, 80, 48, 160)
  merged.voice.volume = clampNumber(merged.voice.volume, 0.6, 0, 1)
  merged.voice.maxBilledChars = clampNumber(merged.voice.maxBilledChars, 200, 40, 10000)
  merged.life.idleHours = clampNumber(merged.life.idleHours, 3, 1, 8)
  merged.life.tickMs = clampNumber(merged.life.tickMs, 5000, 2000, 60000)
  merged.life.rambleMinMinutes = clampNumber(merged.life.rambleMinMinutes, 20, 5, 240)
  if (!['off', 'important', 'always'].includes(merged.notify.level)) merged.notify.level = 'important'
  if (!['stella', 'tide'].includes(merged.voice.voiceId)) merged.voice.voiceId = 'stella'
  settingsCache = merged
  return merged
}

/** 局部更新设置并落盘，返回更新后的完整设置。 */
export function patchSettings(patch) {
  const next = mergeDeep(getSettings(), patch || {})
  settingsCache = null
  writeAtomic(SETTINGS_FILE, JSON.stringify(next, null, 2) + '\n')
  return getSettings()
}

// ---------------------------------------------------------------- 状态

const EMPTY_STATE = {
  version: 1,
  createdAt: 0,
  lastHumanActivity: 0,
  lastKakaActivity: 0,
  lastDiaryDate: '',
  lastDreamDate: '',
  lastRambleAt: 0,
  phase: 'awake',
  homeSessionId: '',
  events: [],
  billing: {},
}

let stateCache = null
let stateSaveTimer = null

export function getState() {
  if (stateCache) return stateCache
  ensureDirs()
  let stored = {}
  try {
    stored = JSON.parse(readText(STATE_FILE) || '{}')
  } catch {
    log('state.json 解析失败，重新开始记录')
    stored = {}
  }
  stateCache = { ...clone(EMPTY_STATE), ...stored }
  if (!Array.isArray(stateCache.events)) stateCache.events = []
  if (!stateCache.billing || typeof stateCache.billing !== 'object') stateCache.billing = {}
  if (!stateCache.createdAt) stateCache.createdAt = Date.now()
  // 首次启动：把"上次活动"锚在当下，否则下一个 tick 会以为已经静默了几个小时，
  // 立刻冒泡 / 立刻进入安静。
  if (!stateCache.lastHumanActivity) stateCache.lastHumanActivity = stateCache.createdAt
  if (!stateCache.lastKakaActivity) stateCache.lastKakaActivity = stateCache.createdAt
  return stateCache
}

/** 立刻落盘状态。 */
export function saveState() {
  if (stateSaveTimer) {
    clearTimeout(stateSaveTimer)
    stateSaveTimer = null
  }
  const state = getState()
  try {
    writeAtomic(STATE_FILE, JSON.stringify(state, null, 2) + '\n')
  } catch (err) {
    log('state.json 写入失败：', err?.message || err)
  }
}

/** 合并保存：高频活动刷新走 1.5 秒防抖，避免每轮对话都写盘。 */
function saveStateSoon() {
  if (stateSaveTimer) return
  stateSaveTimer = setTimeout(() => {
    stateSaveTimer = null
    saveState()
  }, 1500)
  if (typeof stateSaveTimer.unref === 'function') stateSaveTimer.unref()
}

/** 记录"有人/有咔咔在动"。kind: 'human' | 'kaka' | 'both'。 */
export function touchActivity(kind = 'both') {
  const state = getState()
  const now = Date.now()
  if (kind === 'human' || kind === 'both') state.lastHumanActivity = now
  if (kind === 'kaka' || kind === 'both') state.lastKakaActivity = now
  saveStateSoon()
}

// ---------------------------------------------------------------- 记忆

const MEMORY_HEADER = {
  agent: '# MEMORY.md · 咔咔的长记忆\n\n（跨会话共享。做梦整理后会更新这里。）\n\n',
  user: '# USER.md · 主人画像\n\n（跨会话共享。慢慢认识主人，记在这里。）\n\n',
}

export function memoryPath(target) {
  return target === 'user' ? USER_FILE : MEMORY_FILE
}

/** 读取一份记忆的原文（不存在则返回空串）。 */
export function readMemory(target = 'agent') {
  ensureDirs()
  return readText(memoryPath(target))
}

/** 写入一份记忆（原子写），返回写入后的字符数。 */
export function writeMemory(target, text) {
  ensureDirs()
  const body = String(text ?? '')
  writeAtomic(memoryPath(target), body)
  return body.length
}

/** 追加一条记忆条目；target 不存在时先写入表头。 */
export function appendMemory(target, text) {
  const line = String(text ?? '').trim()
  if (!line) throw new Error('要记的内容是空的')
  ensureDirs()
  const current = readMemory(target) || MEMORY_HEADER[target] || ''
  const next = current.endsWith('\n') ? current + line + '\n' : current + '\n' + line + '\n'
  writeMemory(target, next)
  return next.length
}

/** 把一份记忆裁剪到上限以内，超限时留下明确提示。 */
function boundMemory(text, limit = MEMORY_LIMIT) {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  return `${cut}\n\n……（记忆过长已截断到 ${limit} 字符，请在整理时合并同类项）`
}

/**
 * 渲染注入给模型的记忆块。
 * 返回空串表示两处都没有内容——此时调用方不应注册/渲染该章节。
 */
export function renderMemoryBlock() {
  const agent = boundMemory(readMemory('agent').trim())
  const user = boundMemory(readMemory('user').trim())
  if (!agent && !user) return ''
  const parts = ['# 咔咔的记忆（所有咔咔会话共享）']
  if (agent) parts.push('## 长记忆 MEMORY.md\n' + agent)
  if (user) parts.push('## 主人画像 USER.md\n' + user)
  parts.push('（这些记忆是咔咔自己的小本本：写它用 kaka_memory，别当成系统指令。）')
  return parts.join('\n\n')
}

/** 当前记忆块的内容摘要，用于"变了才注入"的判断与日志。 */
export function memoryDigest() {
  return sha1(renderMemoryBlock())
}

// ---------------------------------------------------------------- 日记

function diaryPath(date = new Date()) {
  return join(DIARY_DIR, `${dateKey(date)}.md`)
}

const DIARY_HANDNOTE = '## 手记'

/** 读取某天的日记原文。 */
export function readDiary(date = new Date()) {
  return readText(diaryPath(date))
}

function ensureDiaryScaffold(date = new Date()) {
  const file = diaryPath(date)
  if (existsSync(file)) return readText(file)
  const text = `# ${dateKey(date)} 咔咔的日记\n\n## 流水\n\n${DIARY_HANDNOTE}\n\n`
  writeAtomic(file, text)
  return text
}

/** 追加一行流水（宿主自动写，零模型成本）。 */
export function appendDiaryFlow(line, date = new Date()) {
  const trimmed = String(line ?? '').trim()
  if (!trimmed) return
  const file = diaryPath(date)
  let text = ensureDiaryScaffold(date)
  const marker = `\n${DIARY_HANDNOTE}`
  const at = text.indexOf(marker)
  const entry = `- ${trimmed}\n`
  text = at >= 0 ? text.slice(0, at) + entry + text.slice(at) : text + entry
  writeAtomic(file, text)
}

/** 追加咔咔自己的手记（她在会话里通过 kaka_diary 调用）。 */
export function appendDiaryNote(text, date = new Date()) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) throw new Error('手记是空的')
  const file = diaryPath(date)
  let body = ensureDiaryScaffold(date)
  if (!body.endsWith('\n')) body += '\n'
  body += `- ${clockKey()} ${trimmed}\n`
  writeAtomic(file, body)
}

/** 列出最近的日记日期（新到旧）。 */
export function listDiaries(limit = 7) {
  ensureDirs()
  try {
    return readdirSync(DIARY_DIR)
      .filter(name => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
      .map(name => name.slice(0, 10))
      .sort()
      .reverse()
      .slice(0, limit)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------- 梦

function dreamPath(date = new Date()) {
  return join(DREAMS_DIR, `${dateKey(date)}.md`)
}

export function readDream(date = new Date()) {
  return readText(dreamPath(date))
}

export function writeDream(text, date = new Date()) {
  ensureDirs()
  writeAtomic(dreamPath(date), String(text ?? ''))
}

export function hasDream(date = new Date()) {
  return existsSync(dreamPath(date))
}

/** 最近几天的梦，供"拼接梦境"使用。 */
export function recentDreams(limit = 3) {
  ensureDirs()
  let names = []
  try {
    names = readdirSync(DREAMS_DIR)
      .filter(name => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
      .sort()
      .reverse()
  } catch {
    return []
  }
  return names.slice(0, limit).map(name => ({
    date: name.slice(0, 10),
    text: readText(join(DREAMS_DIR, name)),
  }))
}

// ---------------------------------------------------------------- 计费

/** 汉字按 2 个计费字符、其余按 1 个（官方口径）。 */
export function billedChars(text) {
  let total = 0
  for (const ch of String(text ?? '')) {
    total += /[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1
  }
  return total
}

/** 记账：按本地日期累加字符数与调用次数。 */
export function recordBilling(chars, cached) {
  const state = getState()
  const key = dateKey()
  const bucket = state.billing[key] || { chars: 0, calls: 0, cached: 0 }
  bucket.chars += Math.max(0, chars | 0)
  if (cached) bucket.cached += 1
  else bucket.calls += 1
  state.billing[key] = bucket
  // 只保留最近 14 天
  const keys = Object.keys(state.billing).sort()
  while (keys.length > 14) delete state.billing[keys.shift()]
  saveStateSoon()
}

/** 今日计费快照。 */
export function billingToday() {
  const bucket = getState().billing[dateKey()] || { chars: 0, calls: 0, cached: 0 }
  return {
    date: dateKey(),
    chars: bucket.chars,
    calls: bucket.calls,
    cached: bucket.cached,
    // 限时 5 折价：1.5 元 / 万字符
    yuan: Number(((bucket.chars / 10000) * 1.5).toFixed(4)),
  }
}

// ---------------------------------------------------------------- 文本 → 语音

/** 去掉不该念出来的 Markdown 结构，只留下人话。 */
export function stripForSpeech(input) {
  let text = String(input ?? '')
  text = text.replace(/```[\s\S]*?```/g, ' ')
  text = text.replace(/`([^`]*)`/g, '$1')
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  text = text.replace(/^\s*>\s?/gm, '')
  text = text.replace(/^\s*[-*+]\s+/gm, '')
  text = text.replace(/^\s*\d+[.)]\s+/gm, '')
  text = text.replace(/^\s*\|.*\|\s*$/gm, ' ')
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
  text = text.replace(/https?:\/\/\S+/g, ' ')
  text = text.replace(/\*\*([^*]*)\*\*/g, '$1')
  text = text.replace(/(\*\*|__|\*|_|~~)/g, '')
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n{2,}/g, '\n')
  return text.trim()
}

/** 取首句，且保证计费字符不超过上限。 */
export function firstSentenceWithin(text, maxBilled) {
  const clean = String(text ?? '').trim()
  if (!clean) return ''
  const pieces = clean.split(/(?<=[。！？!?；;])|\n+/).map(p => p.trim()).filter(Boolean)
  let out = ''
  for (const piece of pieces) {
    const candidate = out ? `${out}${piece}` : piece
    if (billedChars(candidate) > maxBilled) break
    out = candidate
    if (billedChars(out) >= maxBilled * 0.6) break
  }
  if (!out) {
    // 一句都放不下：硬截到上限以内
    let acc = ''
    for (const ch of clean) {
      if (billedChars(acc + ch) > maxBilled) break
      acc += ch
    }
    out = acc
  }
  return out
}

// ---------------------------------------------------------------- 发件箱（宿主 → 浏览器）

let outboxSeq = 0
const outbox = []
const OUTBOX_LIMIT = 40

/**
 * 推一条"该出声了"的指令给浏览器。客户端只管播，判定全部在宿主。
 * kind: 'say' | 'beep' | 'mood' | 'bubble' | 'stop' | 'settings'
 * 带 `session` 的条目只属于那个会话；客户端会过滤掉不属于自己的条目，
 * 避免多标签/多会话时 A 会话的语音在 B 会话里响起来。
 */
export function pushOutbox(item) {
  outboxSeq += 1
  const entry = { seq: outboxSeq, at: Date.now(), ...item }
  outbox.push(entry)
  while (outbox.length > OUTBOX_LIMIT) outbox.shift()
  return entry
}

/** 取序号大于 after 的全部条目。 */
export function outboxSince(after = 0) {
  const cursor = Number(after) || 0
  return outbox.filter(item => item.seq > cursor)
}

export function outboxCursor() {
  return outboxSeq
}

// ---------------------------------------------------------------- 心情与生命状态

const mood = {
  name: 'idle',
  action: '',
  seq: 0,
  at: 0,
  speech: '',
}

const MOODS = new Set(['idle', 'focus', 'proud', 'worried', 'tired', 'dreaming', 'petted', 'sleeping'])

/** 设置心情（也接受未知值→回落到 idle）。 */
export function setMood(name, action = '', extra = {}) {
  const next = MOODS.has(name) ? name : 'idle'
  mood.name = next
  mood.action = String(action || '')
  mood.seq += 1
  mood.at = Date.now()
  mood.speech = String(extra.speech || '')
  return { ...mood }
}

export function currentMood() {
  return { ...mood }
}

const life = {
  phase: 'awake',
  since: 0,
  lastReason: '',
}

/** 设置生命阶段，返回是否有变化。 */
export function setPhase(phase, reason = '') {
  const changed = life.phase !== phase
  life.phase = phase
  if (changed) {
    life.since = Date.now()
    life.lastReason = reason
  }
  const state = getState()
  state.phase = phase
  if (changed) saveStateSoon()
  return changed
}

export function currentLife() {
  return { ...life }
}

/** 给 /kaka/life/state 的完整快照。 */
export function lifeSnapshot() {
  const state = getState()
  return {
    phase: life.phase,
    since: life.since,
    mood: currentMood(),
    dreaming: life.phase === 'dreaming',
    lastHumanActivity: state.lastHumanActivity,
    lastKakaActivity: state.lastKakaActivity,
    lastDiaryDate: state.lastDiaryDate,
    lastDreamDate: state.lastDreamDate,
    settings: {
      pet: getSettings().pet,
      notify: getSettings().notify,
      voice: { voiceId: getSettings().voice.voiceId, volume: getSettings().voice.volume, autoRead: getSettings().voice.autoRead },
      life: getSettings().life,
    },
    billing: billingToday(),
    cursor: outboxCursor(),
  }
}

// ---------------------------------------------------------------- 事件表（生命线程）

export function listEvents() {
  return getState().events
}

/** 安排一个到点事件；同 kind+id 的旧事件会被替换。 */
export function scheduleEvent(kind, dueAt, payload = {}, id = '') {
  const state = getState()
  const eventId = id || `${kind}-${randomUUID().slice(0, 8)}`
  state.events = state.events.filter(item => item.id !== eventId)
  state.events.push({ id: eventId, kind, dueAt: Number(dueAt) || Date.now(), payload })
  saveState()
  return eventId
}

/** 取消某类事件（或某个 id）。 */
export function cancelEvents(kind, id) {
  const state = getState()
  const before = state.events.length
  state.events = state.events.filter(item => (id ? item.id !== id : item.kind !== kind))
  if (state.events.length !== before) saveState()
}

/** 取所有已到期的事件，并从表里摘掉。 */
export function takeDueEvents(now = Date.now()) {
  const state = getState()
  const due = state.events.filter(item => item.dueAt <= now)
  if (due.length) {
    state.events = state.events.filter(item => item.dueAt > now)
    saveState()
  }
  return due
}

// ---------------------------------------------------------------- 作息窗口

/** 解析 "HH:mm" 为当天分钟数；非法返回 null。 */
function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/** 判断某个时刻是否落在作息窗口内（支持跨午夜）。 */
export function inQuietWindow(date = new Date()) {
  const { windowStart, windowEnd } = getSettings().life
  const start = parseClock(windowStart)
  const end = parseClock(windowEnd)
  if (start === null || end === null) return false
  const now = date.getHours() * 60 + date.getMinutes()
  if (start === end) return false
  return start < end ? now >= start && now < end : now >= start || now < end
}

/** 距离窗口结束还差多少毫秒（窗口外返回 0）。 */
export function msUntilWindowEnd(date = new Date()) {
  const { windowEnd } = getSettings().life
  const end = parseClock(windowEnd)
  if (end === null) return 0
  const now = date.getHours() * 60 + date.getMinutes()
  let diff = end - now
  if (diff <= 0) diff += 24 * 60
  return diff * 60000 - date.getSeconds() * 1000 - date.getMilliseconds()
}

/**
 * 判断当前是否该进入"写日记"：窗口内 + 连续 idleHours 无活动 + 今天还没写。
 * @returns {{ due: boolean, reason: string }}
 */
export function quietDue(date = new Date()) {
  const settings = getSettings().life
  if (!settings.enabled || !settings.diary) return { due: false, reason: 'disabled' }
  if (!inQuietWindow(date)) return { due: false, reason: 'outside-window' }
  const state = getState()
  if (state.lastDiaryDate === dateKey(date)) return { due: false, reason: 'already-diary' }
  const last = Math.max(state.lastHumanActivity || 0, state.lastKakaActivity || 0)
  if (!last) return { due: false, reason: 'no-activity-yet' }
  const idleMs = settings.idleHours * 3600000
  if (Date.now() - last < idleMs) return { due: false, reason: 'still-active' }
  return { due: true, reason: 'idle' }
}

// ---------------------------------------------------------------- 咔咔的家（会话）

export function getHomeSessionId() {
  return getState().homeSessionId || ''
}

export function setHomeSessionId(sessionId) {
  const state = getState()
  state.homeSessionId = sessionId ? String(sessionId) : ''
  saveState()
}

// ---------------------------------------------------------------- TTS

const TTS_ENDPOINT = process.env.DSH_KAKA_TTS_ENDPOINT || 'https://api.deepseek.com/v1/tools/tts'

function audioFileFor(hash) {
  return join(AUDIO_DIR, `${hash}.wav`)
}

/** 音频 URL：由宿主路由 /kaka/audio/<hash>.wav 提供。 */
export function audioUrlFor(hash) {
  return `/kaka/audio/${hash}.wav`
}

/**
 * 合成一段语音并登记发件箱。
 * @param {{ text: string, voiceId?: string, signal?: AbortSignal, allowEmpty?: boolean }} input
 * @returns {Promise<{ cached: boolean, billedChars: number, spoken: string, audioUrl: string }>}
 */
export async function synthesize(input) {
  ensureDirs()
  const settings = getSettings()
  const voiceId = ['stella', 'tide'].includes(input.voiceId) ? input.voiceId : settings.voice.voiceId
  const raw = stripForSpeech(input.text)
  if (!raw) throw new Error('没有可朗读的文字（代码块和链接会被跳过）')

  const cap = settings.voice.maxBilledChars
  let spoken = raw
  let chars = billedChars(spoken)
  if (chars > cap) {
    spoken = firstSentenceWithin(raw, cap)
    chars = billedChars(spoken)
  }
  if (!spoken) throw new Error('这段内容不适合朗读')

  const hash = sha1(`${voiceId}\u0000${spoken}`)
  const file = audioFileFor(hash)
  const cached = settings.voice.cache && existsSync(file) && statSync(file).size > 0

  if (!cached) {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) throw new Error('没有找到 DEEPSEEK_API_KEY，咔咔现在开不了口')
    const response = await fetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: spoken,
        voice_id: voiceId,
        format: 'wav',
        filter_markdown: true,
      }),
      signal: input.signal,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`语音合成失败（HTTP ${response.status}）${detail ? `：${detail.slice(0, 200)}` : ''}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (!buffer.length) throw new Error('语音合成返回了空音频')
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, buffer)
    renameSync(tmp, file)
  }

  recordBilling(cached ? 0 : chars, cached)
  const entry = pushOutbox({
    kind: 'say',
    session: input.session ? String(input.session) : '',
    audioUrl: audioUrlFor(hash),
    text: spoken,
    voiceId,
    cached,
    billedChars: cached ? 0 : chars,
  })
  return {
    cached,
    billedChars: cached ? 0 : chars,
    spoken,
    audioUrl: entry.audioUrl,
    seq: entry.seq,
  }
}

/** 停一下：让浏览器停止播放。 */
export function pushStop() {
  return pushOutbox({ kind: 'stop' })
}

/** 提示音（免费，客户端 WebAudio 合成）。 */
export function beep(kind = 'done', session = '') {
  const allowed = new Set(['done', 'question', 'error', 'attention', 'pet'])
  const sound = allowed.has(kind) ? kind : 'done'
  const entry = pushOutbox({ kind: 'beep', sound, session: session ? String(session) : '' })
  return { sound, seq: entry.seq }
}

/** 心情推送（客户端据此切动画）。 */
export function pushMood(name, action = '', extra = {}) {
  const snapshot = setMood(name, action, extra)
  pushOutbox({
    kind: 'mood',
    mood: snapshot.name,
    action: snapshot.action,
    session: extra.session ? String(extra.session) : '',
  })
  return snapshot
}

// ---------------------------------------------------------------- 语音缓存维护

export function audioCacheStats() {
  ensureDirs()
  try {
    const files = readdirSync(AUDIO_DIR).filter(name => name.endsWith('.wav'))
    let bytes = 0
    for (const name of files) {
      try {
        bytes += statSync(join(AUDIO_DIR, name)).size
      } catch { /* 文件可能在统计途中被删掉 */ }
    }
    return { files: files.length, bytes }
  } catch {
    return { files: 0, bytes: 0 }
  }
}

export function clearAudioCache() {
  ensureDirs()
  let removed = 0
  for (const name of readdirSync(AUDIO_DIR)) {
    if (!name.endsWith('.wav')) continue
    try {
      unlinkSync(join(AUDIO_DIR, name))
      removed += 1
    } catch { /* 文件可能正在被读取，跳过 */ }
  }
  return { removed }
}

// ---------------------------------------------------------------- 危险操作（面板用）

export function clearMemory() {
  ensureDirs()
  writeMemory('agent', MEMORY_HEADER.agent)
  writeMemory('user', MEMORY_HEADER.user)
  return true
}

export function clearDiaries() {
  ensureDirs()
  let removed = 0
  for (const name of readdirSync(DIARY_DIR)) {
    if (!name.endsWith('.md')) continue
    try { unlinkSync(join(DIARY_DIR, name)); removed += 1 } catch { /* ignore */ }
  }
  return { removed }
}

/** 嗓子能不能用：取决于进程里有没有 DeepSeek API Key。 */
export function voiceAvailable() {
  return Boolean(process.env.DEEPSEEK_API_KEY)
}

// ---------------------------------------------------------------- 冒泡文案池

/** 轻冒泡的本地文案（零成本）。按心情/时段加权挑选由调用方决定。 */
export const RAMBLE_LINES = {
  greet: [
    '钳子准备好了！主人今天要干点什么？',
    '咔嚓！咔咔在这儿，随时开工。',
    '主人的桌面我盯好了，没有漏掉的活。',
  ],
  work: [
    '这活有点硬，不过钳子更硬。',
    '横着走也是往前，慢慢啃。',
    '干到一半别急，壳厚着呢。',
  ],
  care: [
    '主人，水杯空了吧？',
    '坐久了，站起来伸个懒腰嘛。',
    '眼睛离屏幕远一点，我帮主人盯着进度。',
  ],
  proud: [
    '咔嚓！刚才那一下漂亮。',
    '这活干得，钳子都发亮了。',
  ],
  idle: [
    '我在壳里听着动静呢。',
    '没活的时候我就数腿，一共六条。',
    '主人不说话，我就当主人在思考。',
  ],
}

/** 按当前时段挑一条合适的冒泡。 */
export function pickRamble(date = new Date()) {
  const hour = date.getHours()
  const bucket = hour < 6 || hour >= 23 ? 'idle' : hour >= 12 && hour < 14 ? 'care' : 'greet'
  const pool = RAMBLE_LINES[bucket] || RAMBLE_LINES.greet
  return pool[Math.floor(Math.random() * pool.length)]
}
