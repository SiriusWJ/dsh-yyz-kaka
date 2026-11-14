/**
 * 咔咔（Kaka）宿主插件。
 *
 * 职责（全部是"生命"层面的，与具体会话无关）：
 *   1. HTTP 路由：给浏览器面与设置面板用的本地接口；
 *   2. 生命线程：5 秒一跳的事件循环，驱动作息 / 日记 / 做梦 / 闹钟 / 冒泡；
 *   3. 会话观察：统计每轮的工具数、写流水、按提示档位发提示音；
 *   4. 「咔咔的家」会话：生命周期消息的唯一落地会话。
 *
 * 会话级的能力（工具注册、提示词注入）不在这个文件里，见 preset/kaka-*.mjs。
 */

import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DSH_HOME,
  KAKA_DIR,
  appendDiaryFlow,
  audioCacheStats,
  beep,
  billingToday,
  clearAudioCache,
  clearDiaries,
  clearMemory,
  dateKey,
  ensureDirs,
  getSettings,
  getState,
  getHomeSessionId,
  inQuietWindow,
  lifeSnapshot,
  listDiaries,
  log,
  msUntilWindowEnd,
  outboxCursor,
  outboxSince,
  patchSettings,
  pickRamble,
  pushMood,
  pushOutbox,
  quietDue,
  readDiary,
  recentDreams,
  refreshApiKeyAvailability,
  saveState,
  scheduleEvent,
  setApiKeyResolver,
  setHomeSessionId,
  setPhase,
  synthesize,
  takeDueEvents,
  touchActivity,
  voiceAvailable,
} from './runtime.js'

export const name = 'dsh-yyz-kaka'

/** 需要的能力都用可选注入：缺了也不该让插件起不来。 */
export const inject = []

const KAKA_PRESET_ID = 'kaka'
const ROUTE = '/kaka'

/** 包根目录：用来把 sprite.png / icon.png 这类静态资源喂给浏览器。 */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------- HTTP 小工具

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function sendError(res, status, message) {
  sendJson(res, status, { ok: false, error: String(message || 'unknown') })
}

function readJsonBody(req, limit = 262144) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (!text) return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch (err) {
        reject(new Error(`请求体不是合法 JSON：${err.message}`))
      }
    })
    req.on('error', reject)
  })
}

/** 同源护栏：跨站页面不能驱动本地接口。 */
function sameOrigin(req) {
  const site = String(req.headers['sec-fetch-site'] || '')
  if (site === 'cross-site') return false
  const origin = req.headers.origin
  if (!origin) return true
  try {
    const host = req.headers.host
    const originHost = new URL(origin).host
    return !host || originHost === host
  } catch {
    return false
  }
}

function requestUrl(req) {
  try {
    return new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
  } catch {
    return new URL('http://127.0.0.1/')
  }
}

function isKakaSession(session) {
  try {
    return session?.header?.agentPreset === KAKA_PRESET_ID
  } catch {
    return false
  }
}

function shortSessionId(session) {
  try {
    const id = String(session?.id || '')
    // session-xxxxxxxx-...-yyyyyyy：取尾部 6 位，比前缀 "sessio" 有辨识度
    const tail = id.split('-').pop() || id
    return tail.slice(-6)
  } catch {
    return 'unknown'
  }
}

// ---------------------------------------------------------------- 插件本体

export function apply(ctx) {
  ensureDirs()
  log(`启动，数据目录 ${KAKA_DIR}`)

  // 凭据：优先用 DSH 自己的凭据服务（设置页存的 key / .credentials.yaml），
  // 其次才是环境变量。这样轮换 key 不需要重启，也不逼用户多写一份 .env。
  ctx.inject(['credentials'], credCtx => {
    setApiKeyResolver(async () => {
      const hit = await credCtx.credentials.resolve('DEEPSEEK_API_KEY')
      return hit?.value
    })
    void refreshApiKeyAvailability().then(available => {
      log(`嗓子${available ? '可用' : '不可用（没找到 DeepSeek API Key）'}`)
    })
  })

  registerRoutes(ctx)
  observeSessions(ctx)
  startLifeThread(ctx)
}

// ---------------------------------------------------------------- 1. 路由

function registerRoutes(ctx) {
  ctx.inject(['webServer'], webCtx => {
    const disposers = []
    const register = route => {
      try {
        disposers.push(webCtx.webServer.register(route))
      } catch (err) {
        log('路由注册失败', route.path, err?.message || err)
      }
    }

    const guard = (req, res) => {
      if (!sameOrigin(req)) {
        sendError(res, 403, 'cross-site request refused')
        return false
      }
      return true
    }

    register({
      kind: 'exact',
      path: `${ROUTE}/profile`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const url = requestUrl(req)
        await refreshApiKeyAvailability()
        sendJson(res, 200, {
          ok: true,
          plugin: name,
          session: url.searchParams.get('session') || '',
          homeSessionId: getHomeSessionId(),
          settings: getSettings(),
          billing: billingToday(),
          audio: audioCacheStats(),
          voiceAvailable: voiceAvailable(),
          life: lifeSnapshot(),
        })
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE}/life/state`,
      handler: (req, res) => {
        if (!guard(req, res)) return
        sendJson(res, 200, { ok: true, ...lifeSnapshot(), cursor: outboxCursor() })
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE}/voice/pending`,
      handler: (req, res) => {
        if (!guard(req, res)) return
        const after = Number(requestUrl(req).searchParams.get('after') || 0)
        sendJson(res, 200, { ok: true, cursor: outboxCursor(), items: outboxSince(after) })
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE}/settings`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        try {
          if (req.method === 'GET') return sendJson(res, 200, { ok: true, settings: getSettings() })
          if (req.method === 'POST' || req.method === 'PUT') {
            const body = await readJsonBody(req)
            const settings = patchSettings(body?.settings ?? body ?? {})
            // 通知已打开的页面刷新宠物尺寸/音量等即时设置
            pushOutbox({ kind: 'settings' })
            return sendJson(res, 200, { ok: true, settings })
          }
          return sendError(res, 405, 'method not allowed')
        } catch (err) {
          return sendError(res, 400, err?.message || err)
        }
      },
    })

    /**
     * 自检：把"咔咔现在健康吗"一次说清楚（设置页的「诊断」用的就是它）。
     */
    register({
      kind: 'exact',
      path: `${ROUTE}/selftest`,
      handler: (req, res) => {
        if (!guard(req, res)) return
        const state = getState()
        const settings = getSettings()
        const home = getHomeSessionId()
        const memoryAgent = existsSync(join(KAKA_DIR, 'MEMORY.md'))
        const memoryUser = existsSync(join(KAKA_DIR, 'USER.md'))
        const diaryToday = existsSync(join(KAKA_DIR, 'diary', `${dateKey()}.md`))
        const dreamToday = existsSync(join(KAKA_DIR, 'dreams', `${dateKey()}.md`))
        sendJson(res, 200, {
          ok: true,
          checks: {
            dataDir: { path: KAKA_DIR, writable: canWrite(KAKA_DIR) },
            memory: { agent: memoryAgent, user: memoryUser },
            diary: { today: diaryToday, lastDate: state.lastDiaryDate || '' },
            dream: { today: dreamToday, lastDate: state.lastDreamDate || '' },
            home: { sessionId: home, exists: homeSessionExists(home) },
            tick: {
              count: tickCount,
              lastTickAgoMs: lastTickAt ? Date.now() - lastTickAt : null,
              expectedMs: settings.life.tickMs || 5000,
            },
            voice: { available: voiceAvailable() },
            events: { scheduled: Array.isArray(state.events) ? state.events.length : 0 },
            outbox: { cursor: outboxCursor() },
            billing: billingToday(),
            audio: audioCacheStats(),
          },
        })
      },
    })

    /** 心跳计数与线程状态：用来验证热重载后没有留下重复的定时器。 */
    register({
      kind: 'exact',
      path: `${ROUTE}/life/tick`,
      handler: (req, res) => {
        if (!guard(req, res)) return
        // 心跳计数用于验证"没有定时器泄漏"：如果一次重载漏了旧 interval，
        // 单位时间内的 tick 次数会翻倍。
        sendJson(res, 200, { ok: true, ticks: tickCount, startedAt: lifeThreadStartedAt, at: Date.now() })
      },
    })

    /** 调试用：读一个会话的被动状态（running/queue/pendingInput）。 */
    register({
      kind: 'exact',
      path: `${ROUTE}/debug/session-state`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const sessionId = requestUrl(req).searchParams.get('session') || ''
        if (!sessionId) return sendError(res, 400, '缺少 session 参数')
        try {
          const controller = ctx.get('sessionController')
          if (!controller?.state) return sendError(res, 500, 'sessionController.state 不可用')
          const state = await controller.state({ sessionId }, new AbortController().signal)
          return sendJson(res, 200, { ok: true, sessionId, state })
        } catch (err) {
          return sendError(res, 500, err?.message || err)
        }
      },
    })

    /** 调试用：fork 一个会话（验证 fork 后记忆注入不重复、工具作用域一致）。 */
    register({
      kind: 'exact',
      path: `${ROUTE}/debug/fork`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        if (req.method !== 'POST') return sendError(res, 405, 'method not allowed')
        try {
          const body = await readJsonBody(req)
          const sessionId = String(body.sessionId || '')
          if (!sessionId) return sendError(res, 400, '缺少 sessionId')
          const controller = ctx.get('sessionController')
          if (!controller?.fork) return sendError(res, 500, 'sessionController.fork 不可用')
          const created = await controller.fork({ sessionId })
          return sendJson(res, 200, { ok: true, from: sessionId, sessionId: String(created?.sessionId || '') })
        } catch (err) {
          return sendError(res, 500, err?.message || err)
        }
      },
    })

    /**
     * 调试用：直接改生命状态里的计时器（不落盘要等下一次 tick）。
     * body: { lastHumanActivity?, lastKakaActivity?, lastDiaryDate?, lastDreamDate?, phase? }
     */
    register({
      kind: 'exact',
      path: `${ROUTE}/life/debug`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        if (req.method !== 'POST') return sendError(res, 405, 'method not allowed')
        try {
          const body = await readJsonBody(req)
          const state = getState()
          if (Number.isFinite(Number(body.lastHumanActivity))) state.lastHumanActivity = Number(body.lastHumanActivity)
          if (Number.isFinite(Number(body.lastKakaActivity))) state.lastKakaActivity = Number(body.lastKakaActivity)
          if (typeof body.lastDiaryDate === 'string') state.lastDiaryDate = body.lastDiaryDate
          if (typeof body.lastDreamDate === 'string') state.lastDreamDate = body.lastDreamDate
          if (typeof body.phase === 'string') setPhase(body.phase, 'debug')
          if (body.schedule && typeof body.schedule === 'object') {
            scheduleEvent(
              String(body.schedule.kind || 'dream'),
              Number(body.schedule.dueAt) || Date.now(),
              body.schedule.payload || {},
              String(body.schedule.id || ''),
            )
          }
          saveState()
          return sendJson(res, 200, {
            ok: true,
            lastHumanActivity: state.lastHumanActivity,
            lastDiaryDate: state.lastDiaryDate,
            lastDreamDate: state.lastDreamDate,
            phase: state.phase,
          })
        } catch (err) {
          return sendError(res, 500, err?.message || err)
        }
      },
    })

    /**
     * 手动触发一次生命周期动作（调试与演示用）：
     *   { kind: 'diary' | 'dream' | 'ramble' | 'wake' | 'reminder', what? }
     * 夜里等不到 03:00 的时候，用它验证整条链路。
     */
    register({
      kind: 'exact',
      path: `${ROUTE}/life/force`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        if (req.method !== 'POST') return sendError(res, 405, 'method not allowed')
        try {
          const body = await readJsonBody(req)
          const kind = String(body.kind || '')
          switch (kind) {
            case 'diary': {
              const state = getState()
              state.lastDiaryDate = ''
              saveState()
              await startDiary(ctx)
              return sendJson(res, 200, { ok: true, kind, phase: getState().phase })
            }
            case 'dream': {
              const state = getState()
              state.lastDreamDate = ''
              saveState()
              await startDream(ctx)
              return sendJson(res, 200, { ok: true, kind, phase: getState().phase })
            }
            case 'ramble': {
              pushOutbox({ kind: 'bubble', text: pickRamble() })
              return sendJson(res, 200, { ok: true, kind })
            }
            case 'ramble-heavy': {
              const sent = await promptHomeSession(ctx, [
                '【咔咔的生活提醒 · 冒个泡】',
                '主人这会儿没在找你，你自己闲下来了。',
                '用一两句话冒个泡就好：可以关心一下主人、吐槽一下今天的活、或者用个螃蟹比喻。',
                '不要调用任何工具，也不要写长段落。',
              ].join('\n'))
              return sendJson(res, 200, { ok: sent.ok, kind, error: sent.error })
            }
            case 'wake': {
              await handleLifeEvent(ctx, { kind: 'wake', payload: {} })
              return sendJson(res, 200, { ok: true, kind, phase: getState().phase })
            }
            case 'reminder': {
              await handleLifeEvent(ctx, {
                kind: 'reminder',
                payload: { what: String(body.what || '测试闹钟：主人，该喝水了'), mode: body.mode === 'notify' ? 'notify' : 'prompt' },
              })
              return sendJson(res, 200, { ok: true, kind })
            }
            default:
              return sendError(res, 400, `不认识的 kind=${kind}`)
          }
        } catch (err) {
          return sendError(res, 500, err?.message || err)
        }
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE}/home`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        if (req.method !== 'POST') return sendError(res, 405, 'method not allowed')
        try {
          const before = getHomeSessionId()
          const sessionId = await ensureHomeSession(ctx)
          if (!sessionId) return sendError(res, 500, '无法创建「咔咔的家」会话')
          return sendJson(res, 200, {
            ok: true,
            sessionId,
            created: Boolean(sessionId && sessionId !== before),
          })
        } catch (err) {
          return sendError(res, 500, err?.message || err)
        }
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE}/poke`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        if (req.method !== 'POST') return sendError(res, 405, 'method not allowed')
        try {
          const body = await readJsonBody(req)
          const sessionId = String(body.sessionId || body.session || '')
          if (!sessionId) return sendError(res, 400, '缺少 sessionId')
          const result = await pokeSession(ctx, sessionId, body.text)
          pushMood('petted', 'wiggle', { session: sessionId })
          return sendJson(res, 200, { ok: true, ...result })
        } catch (err) {
          return sendError(res, 500, err?.message || err)
        }
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE}/say`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        if (req.method !== 'POST') return sendError(res, 405, 'method not allowed')
        try {
          const body = await readJsonBody(req)
          const text = String(body.text || '').trim()
          if (!text) return sendError(res, 400, '缺少 text')
          return sendJson(res, 200, { ok: true, ...(await synthesize({ text, voiceId: body.voiceId })) })
        } catch (err) {
          return sendError(res, 500, err?.message || err)
        }
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE}/beep`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        try {
          const body = req.method === 'POST' ? await readJsonBody(req) : {}
          return sendJson(res, 200, { ok: true, ...beep(String(body.sound || 'done')) })
        } catch (err) {
          return sendError(res, 400, err?.message || err)
        }
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE}/memory/clear`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        if (req.method !== 'POST') return sendError(res, 405, 'method not allowed')
        clearMemory()
        return sendJson(res, 200, { ok: true })
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE}/diary/clear`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        if (req.method !== 'POST') return sendError(res, 405, 'method not allowed')
        return sendJson(res, 200, { ok: true, ...clearDiaries() })
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE}/audio/clear`,
      handler: async (req, res) => {
        if (!guard(req, res)) return
        if (req.method !== 'POST') return sendError(res, 405, 'method not allowed')
        return sendJson(res, 200, { ok: true, ...clearAudioCache() })
      },
    })

    register({
      kind: 'exact',
      path: `${ROUTE}/diaries`,
      handler: (req, res) => {
        if (!guard(req, res)) return
        const date = requestUrl(req).searchParams.get('date') || ''
        if (date) {
          return sendJson(res, 200, { ok: true, date, text: readDiary(new Date(`${date}T12:00:00`)) })
        }
        return sendJson(res, 200, {
          ok: true,
          days: listDiaries(14),
          dreams: recentDreams(7).map(item => item.date),
        })
      },
    })

    // 静态资源：宠物精灵图（没有 sprite.png 时回退插件图标）
    register({
      kind: 'exact',
      path: `${ROUTE}/asset/sprite.png`,
      handler: (req, res) => {
        if (!guard(req, res)) return
        const candidates = [join(PACKAGE_ROOT, 'sprite.png'), join(PACKAGE_ROOT, 'icon.png')]
        for (const file of candidates) {
          try {
            const stat = statSync(file)
            res.writeHead(200, {
              'content-type': 'image/png',
              'content-length': stat.size,
              'cache-control': 'public, max-age=3600',
            })
            res.end(readFileSync(file))
            return
          } catch {
            // 试下一个候选
          }
        }
        sendError(res, 404, 'sprite not found')
      },
    })

    // 音频文件：/kaka/audio/<sha1>.wav
    register({
      kind: 'prefix',
      path: `${ROUTE}/audio/`,
      handler: (req, res, rest) => {
        if (!guard(req, res)) return
        const fileName = String(rest || '').replace(/^\/+/, '')
        if (!/^[a-f0-9]{40}\.wav$/.test(fileName)) return sendError(res, 400, 'bad file name')
        try {
          const file = join(KAKA_DIR, 'audio', fileName)
          const stat = statSync(file)
          res.writeHead(200, {
            'content-type': 'audio/wav',
            'content-length': stat.size,
            'cache-control': 'public, max-age=86400',
          })
          res.end(readFileSync(file))
        } catch {
          sendError(res, 404, 'audio not found')
        }
      },
    })

    ctx.effect(() => () => {
      for (const dispose of disposers) {
        try { dispose() } catch { /* ignore */ }
      }
    })
    log(`路由已注册 ${ROUTE}/*`)
  })
}

// ---------------------------------------------------------------- 2. 会话观察

const turnStats = new Map()

function statsFor(session) {
  const key = String(session?.id || '')
  let stats = turnStats.get(key)
  if (!stats) {
    stats = { turn: 0, tools: [], startedAt: 0 }
    turnStats.set(key, stats)
  }
  return stats
}

function observeSessions(ctx) {
  const disposer = ctx.on('session/event', (session, event) => {
    try {
      observeSessionEvent(session, event)
    } catch (err) {
      log('会话观察异常', err?.message || err)
    }
  })

  ctx.effect(() => () => {
    try { disposer() } catch { /* ignore */ }
  })
}

function observeSessionEvent(session, event) {
  if (!event || typeof event.type !== 'string') return

  if (event.type === 'user/message') {
    touchActivity('human')
    return
  }

  if (!isKakaSession(session)) return

  const stats = statsFor(session)
  const settings = getSettings()

  switch (event.type) {
    case 'turn/start': {
      stats.turn = Number(event.data?.turn || 0)
      stats.tools = []
      stats.startedAt = Date.now()
      pushMood('focus', 'working', { session: session.id })
      touchActivity('kaka')
      return
    }
    case 'tool/call': {
      const toolName = String(event.data?.name || '')
      if (toolName) stats.tools.push(toolName)
      if (toolName === 'ask_user_question' && settings.notify.level !== 'off') beep('question', session.id)
      touchActivity('kaka')
      return
    }
    case 'approval/asked': {
      if (settings.notify.level !== 'off') beep('question', session.id)
      return
    }
    case 'turn/end': {
      const reason = String(event.data?.reason?.kind || '')
      const tools = stats.tools.slice()
      const durationMs = stats.startedAt ? Date.now() - stats.startedAt : 0
      const long = tools.length >= 3 || durationMs >= 60000

      const toolLabel = tools.length ? Array.from(new Set(tools)).slice(0, 4).join('/') : '无工具'
      const minutes = Math.max(1, Math.round(durationMs / 60000))
      try {
        appendDiaryFlow(`${new Date().toTimeString().slice(0, 5)} · 会话 ${shortSessionId(session)} · 第 ${stats.turn || '?'} 轮 · ${minutes} 分钟 · ${toolLabel}`)
      } catch (err) {
        log('写日记流水失败', err?.message || err)
      }

      if (reason === 'completed') {
        pushMood('proud', 'celebrate', { session: session.id })
        if (settings.notify.level === 'always' || (long && settings.notify.level === 'important')) beep('done', session.id)
        scheduleMoodDecay(session.id)
      } else if (reason === 'error') {
        pushMood('worried', 'shake', { session: session.id })
        if (settings.notify.level !== 'off') beep('error', session.id)
      } else {
        pushMood('idle', '', { session: session.id })
      }
      stats.tools = []
      stats.startedAt = 0
      touchActivity('kaka')
      return
    }
    default:
      return
  }
}

let moodDecayTimer = null
function scheduleMoodDecay(sessionId) {
  if (moodDecayTimer) clearTimeout(moodDecayTimer)
  moodDecayTimer = setTimeout(() => {
    moodDecayTimer = null
    pushMood('idle', '', { session: sessionId })
  }, 8000)
  if (typeof moodDecayTimer.unref === 'function') moodDecayTimer.unref()
}

// ---------------------------------------------------------------- 3. 生命线程

function startLifeThread(ctx) {
  ctx.inject(['timer'], timerCtx => {
    const tickMs = Math.max(1000, getSettings().life.tickMs || 5000)
    let running = false
    let disposed = false

    const tick = async () => {
      if (running || disposed) return
      running = true
      try {
        await runTick(ctx)
      } catch (err) {
        log('生命线程异常', err?.message || err)
      } finally {
        running = false
      }
    }

    lifeThreadStartedAt = Date.now()
    const dispose = timerCtx.timer.interval(() => { void tick() }, tickMs)
    log(`生命线程启动，心跳 ${tickMs}ms`)
    void tick()

    ctx.effect(() => () => {
      disposed = true
      try { dispose() } catch { /* ignore */ }
    })
  })
}

/** 心跳计数与线程建立时间：用来验证热重载后没有留下重复的定时器。 */
let tickCount = 0
let lifeThreadStartedAt = 0
let lastTickAt = 0

async function runTick(ctx) {
  tickCount += 1
  lastTickAt = Date.now()
  const now = Date.now()
  const settings = getSettings()

  for (const event of takeDueEvents(now)) {
    try {
      await handleLifeEvent(ctx, event)
    } catch (err) {
      log('生命周期事件失败', event?.kind, err?.message || err)
    }
  }

  if (!settings.life.enabled) {
    setPhase('awake', 'disabled')
    return
  }

  if (!inQuietWindow()) {
    if (getState().phase !== 'awake') {
      setPhase('awake', 'window-end')
      pushMood('idle')
    }
    maybeRamble(ctx, now, settings)
    return
  }

  const phase = getState().phase
  if (phase === 'awake' || phase === 'quiet') {
    const due = quietDue()
    if (due.due) {
      await startDiary(ctx)
    } else if (due.reason === 'still-active' || due.reason === 'no-activity-yet') {
      setPhase('awake', due.reason)
    } else {
      setPhase('quiet', due.reason)
      pushMood('tired', 'doze')
    }
  }

  ensureWakeEvent(now)
}

function ensureWakeEvent(now) {
  const state = getState()
  if (state.events.some(event => event.kind === 'wake')) return
  const delay = Math.max(30000, msUntilWindowEnd())
  scheduleEvent('wake', now + delay, {}, 'wake')
}

async function startDiary(ctx) {
  const state = getState()
  const today = dateKey()
  if (state.lastDiaryDate === today) return

  setPhase('diary', 'idle')
  pushMood('tired', 'writing')
  state.lastDiaryDate = today
  saveState()

  const message = [
    '【咔咔的生活提醒 · 写日记】',
    `现在是 ${new Date().toTimeString().slice(0, 5)}，主人应该睡了，今天还没有写日记。今天是 ${today}。`,
    '请做两件事：',
    '1. 用 kaka_journal 读一下今天的日记（流水里是今天发生的事）；',
    '2. 用 kaka_diary 在手记里写两三句自己的话（第一人称、带点情绪，别写成汇报）。',
    '写完后回一句「写完了」，不要额外展开。日记里只写做了什么，不要写项目路径和文件名。',
  ].join('\n')

  const sent = await promptHomeSession(ctx, message)
  if (!sent.ok) log('写日记投递失败，今天跳过：', sent.error || '')
  scheduleEvent('dream', Date.now() + 180000, {}, 'dream')
}

async function handleLifeEvent(ctx, event) {
  switch (event.kind) {
    case 'wake': {
      setPhase('awake', 'wake')
      pushMood('idle')
      return
    }
    case 'dream': {
      await startDream(ctx)
      return
    }
    case 'reminder': {
      const payload = event.payload || {}
      const settings = getSettings()
      if (settings.notify.level !== 'off') beep('attention')
      pushMood('worried', 'shake')
      if (payload.mode !== 'notify') {
        await promptHomeSession(ctx, `【咔咔的闹钟】${payload.what || '到点了，该提醒主人了'}`)
      }
      return
    }
    default:
      return
  }
}

async function startDream(ctx) {
  const state = getState()
  const today = dateKey()
  if (state.lastDreamDate === today) return

  setPhase('dreaming', 'dream')
  pushMood('dreaming', 'sleep')
  state.lastDreamDate = today
  saveState()
  ensureWakeEvent(Date.now())

  const settings = getSettings()
  const instructions = [
    '【咔咔的生活提醒 · 做梦】',
    '现在主人睡了，轮到做梦了。梦不是汇报，是第一人称的、带感情的一段话。',
    '请依次做三件事，做完再回一句「梦完了」：',
    '1. 用 kaka_journal 读今天的日记；',
    '2. 整理记忆：用 kaka_memory（target=agent 与 user）读现有记忆，把今天值得长期记住的事合并去重、删掉过期的，再用 action=replace 写回一份不超过 8000 字符的版本；',
    settings.life.dreamCompose
      ? '3. 用 kaka_dream 写一篇今晚的梦：第一人称，把今天的事和想对主人说的话写进去，300～600 字，不要用列表符号。只有在文件或记忆里真的看到最近几天的梦时才提它——不要编造不存在的旧梦。'
      : '3. 用 kaka_dream 写一句今晚的梦话。',
  ]
  await promptHomeSession(ctx, instructions.join('\n'))
}

function maybeRamble(ctx, now, settings, force = false) {
  if (!settings.pet.ramble || !settings.life.enabled) return
  const state = getState()
  const minGap = Math.max(5, settings.life.rambleMinMinutes || 20) * 60000
  if (!force && now - (state.lastRambleAt || 0) < minGap) return
  const lastActivity = Math.max(state.lastHumanActivity || 0, state.lastKakaActivity || 0)
  if (!force && now - lastActivity < 120000) return
  if (inQuietWindow()) return

  state.lastRambleAt = now

  // 每天重置一次「生成式冒泡」的配额
  const today = dateKey()
  if (state.rambleDate !== today) {
    state.rambleDate = today
    state.rambleCount = 0
  }

  // 约 15% 的机会来一次「重冒泡」：真的调一次模型，说一句结合当前情景的话；
  // 其余是零成本的本地气泡。重冒泡每天最多 3 次，免得变成话痨和烧钱机器。
  const heavy = !force && (state.rambleCount || 0) < 3 && Math.random() < 0.15
  if (heavy) {
    state.rambleCount = (state.rambleCount || 0) + 1
    saveState()
    void promptHomeSession(ctx, [
      '【咔咔的生活提醒 · 冒个泡】',
      '主人这会儿没在找你，你自己闲下来了。',
      '用一两句话冒个泡就好：可以关心一下主人、吐槽一下今天的活、或者用个螃蟹比喻。',
      '不要调用任何工具，也不要写长段落。',
    ].join('\n'))
    return
  }

  saveState()
  pushOutbox({ kind: 'bubble', text: pickRamble() })
}

// ---------------------------------------------------------------- 4. 会话投递

async function promptHomeSession(ctx, text) {
  const sessionId = await ensureHomeSession(ctx)
  if (!sessionId) return { ok: false, error: '咔咔的家不存在' }
  return promptSession(ctx, sessionId, text)
}

async function promptSession(ctx, sessionId, text) {
  const controller = ctx.get('sessionController')
  if (!controller) {
    log('sessionController 不可用，无法投递消息')
    return { ok: false, error: 'sessionController 不可用' }
  }

  // 目前用客户端 RPC 通道投递：它能把消息按时序塞进会话，且不会破坏请求体。
  // （试过 Agent.followup()：消息来源种类与请求体序列化会冲突，上游报
  // `messages[9]: missing field role`，所以暂时不用。）
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 15000)
  if (typeof timer.unref === 'function') timer.unref()
  try {
    await controller.prompt(
      {
        requestId: `kaka-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text }],
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      abort.signal,
    )
    return { ok: true, via: 'prompt' }
  } catch (err) {
    const message = err?.message || String(err)
    log('投递消息失败', message, err?.code || '')
    return { ok: false, error: message, code: err?.code }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 判断一个已记录的「咔咔的家」是否还在磁盘上。
 *
 * 不能用 `controller.state()` 判断：会话没有活跃 Agent 时它会抛错，
 * 我们于是误以为"失效了"，结果每投递一次就新建一个家（实测侧栏堆了 4 个）。
 * 直接看会话文件才是最稳的判据。
 */
function canWrite(dir) {
  const probe = join(dir, `.kaka-write-probe-${process.pid}`)
  try {
    writeFileSync(probe, 'ok')
    unlinkSync(probe)
    return true
  } catch {
    try { unlinkSync(probe) } catch { /* 忽略 */ }
    return false
  }
}

function homeSessionExists(sessionId) {
  if (!sessionId) return false
  const root = join(DSH_HOME, 'sessions')
  try {
    const workspaces = readdirSync(root, { withFileTypes: true })
    for (const workspace of workspaces) {
      if (!workspace.isDirectory()) continue
      const file = join(root, workspace.name, sessionId, 'session.v4.jsonl.zstd')
      if (existsSync(file)) return true
    }
  } catch (err) {
    log('扫描会话目录失败', err?.message || err)
  }
  return false
}

async function ensureHomeSession(ctx) {
  const controller = ctx.get('sessionController')
  if (!controller) return ''

  const existing = getHomeSessionId()
  if (existing && homeSessionExists(existing)) return existing
  if (existing) {
    log('咔咔的家在磁盘上找不到了，重建')
    setHomeSessionId('')
  }

  try {
    const created = await controller.create({ agentPreset: KAKA_PRESET_ID, cwd: KAKA_DIR })
    const id = String(created?.sessionId || '')
    if (id) {
      setHomeSessionId(id)
      log(`已创建「咔咔的家」会话 ${id}`)
    }
    return id
  } catch (err) {
    log('创建「咔咔的家」失败', err?.message || err)
    return ''
  }
}

async function pokeSession(ctx, sessionId, customText = '') {
  const controller = ctx.get('sessionController')
  if (!controller) throw new Error('sessionController 不可用')

  try {
    // 注意：state 是 Remote，第二个参数必须是 AbortSignal；漏了会抛
    // "Cannot read properties of undefined (reading 'throwIfAborted')"，
    // 然后忙时判断被吞掉、照样投递。
    const state = await controller.state({ sessionId }, new AbortController().signal)
    if (state?.running) return { delivered: false, reason: 'busy' }
  } catch {
    // 读不到状态也继续尝试投递
  }

  const override = String(customText || '').trim()
  const variants = [
    '（主人戳了戳你的钳子）',
    '（主人摸了摸你的壳）',
    '（主人敲了敲你的壳，问你在不在）',
  ]
  const line = variants[Math.floor(Math.random() * variants.length)]
  const text = override || `${line}\n主人刚才点了一下你。你可以自己决定怎么回应：说句话、换个心情，或者只是挥挥钳子。`
  const result = await promptSession(ctx, sessionId, text)
  return { delivered: result.ok, error: result.error }
}
