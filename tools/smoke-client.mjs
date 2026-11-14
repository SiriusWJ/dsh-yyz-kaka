/**
 * 客户端 bundle 冒烟 + 渲染测试（零依赖）。
 *
 * 不是真的浏览器，但做三件真事：
 *   1. 在最小 React 桩里执行 client/client.js 的工厂（抓导入期与注册期错误）；
 *   2. 用一个 60 行的迷你渲染器把组件**真跑一遍**（抓 render 体里的错误、
 *      hooks 顺序错误、样式计算错误）；
 *   3. 断言关键分支：非咔咔会话只出锚点、咔咔会话出宠物、设置页出容器。
 *
 * 用法：node tools/smoke-client.mjs
 */

import { readFileSync } from 'node:fs'

// ---------------------------------------------------------------- 迷你 React

const ELEMENT = Symbol('element')

function createMiniReact() {
  let hookStore = new Map()
  let currentEntry = null
  let dirty = false

  class Component {
    constructor(props) {
      this.props = props
      this.state = this.constructor.__initialState ? this.constructor.__initialState() : {}
    }

    setState(next) {
      this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
      dirty = true
    }
  }

  function slot(index, init) {
    if (!currentEntry.hooks[index]) currentEntry.hooks[index] = { value: typeof init === 'function' ? init() : init }
    return currentEntry.hooks[index]
  }

  const React = {
    Component,
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      const flat = children.flat(Infinity)
      const merged = flat.length === 0 ? { ...(props || {}) } : { ...(props || {}), children: flat.length === 1 ? flat[0] : flat }
      return { [ELEMENT]: true, type, props: merged, children: flat }
    },
    useState(initial) {
      const index = currentCursor++
      const cell = slot(index, initial)
      return [cell.value, function (next) {
        cell.value = typeof next === 'function' ? next(cell.value) : next
        dirty = true
      }]
    },
    useRef(value) {
      const index = currentCursor++
      if (!currentEntry.hooks[index]) currentEntry.hooks[index] = { ref: { current: value } }
      return currentEntry.hooks[index].ref
    },
    useEffect() { currentCursor += 1 },
    useMemo(factory) { currentCursor += 1; return factory() },
    useCallback(fn) { currentCursor += 1; return fn },
  }

  let currentCursor = 0
  const clickables = []

  function renderNode(node, path) {
    if (node === null || node === undefined || node === false || node === true) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map((child, index) => renderNode(child, path + '/' + index)).join('')
    if (!node[ELEMENT]) return ''

    const { type, props, children } = node

    if (type === React.Fragment) return children.map((child, index) => renderNode(child, path + '/f' + index)).join('')

    if (typeof type === 'function') {
      const isClass = type.prototype && typeof type.prototype.render === 'function'
      const previousEntry = currentEntry
      const previousCursor = currentCursor
      const key = path + '#' + (type.name || 'anon')
      if (!hookStore.has(key)) hookStore.set(key, { hooks: [] })
      currentEntry = hookStore.get(key)
      currentCursor = 0
      try {
        if (isClass) {
          const instance = new type(props)
          instance.props = props
          if (!instance.state) instance.state = {}
          return renderNode(instance.render(), path + '/c')
        }
        return renderNode(type({ ...props, children }), path + '/c')
      } finally {
        currentEntry = previousEntry
        currentCursor = previousCursor
      }
    }

    if (typeof props.onClick === 'function') clickables.push({ type: String(type), label: props['aria-label'] || '', onClick: props.onClick })

    const attrs = Object.keys(props)
      .filter(key => key !== 'children' && props[key] !== undefined)
      .map(key => {
        const value = props[key]
        if (typeof value === 'string' || typeof value === 'number') return key + '=' + String(value).slice(0, 60)
        if (typeof value === 'boolean') return key + '=' + value
        return key
      })
    return '#' + String(type) + '[' + attrs.join('|') + ']' + children.map((child, index) => renderNode(child, path + '/' + index)).join('')
  }

  /** 渲染并允许 setState 触发的重渲染（最多 8 次），返回最终标记与可点元素。 */
  function renderRoot(element) {
    hookStore = new Map()
    for (let pass = 0; pass < 8; pass += 1) {
      clickables.length = 0
      dirty = false
      currentEntry = null
      currentCursor = 0
      const markup = renderNode(element, 'root')
      if (!dirty) {
        return { markup, clickables: clickables.slice(), passes: pass + 1 }
      }
    }
    return { markup: '', clickables: clickables.slice(), passes: 8, overflow: true }
  }

  /** 保留 hooks 再渲染一次：模拟「点了按钮之后」。 */
  function rerender(element) {
    for (let pass = 0; pass < 8; pass += 1) {
      clickables.length = 0
      dirty = false
      currentEntry = null
      currentCursor = 0
      const markup = renderNode(element, 'root')
      if (!dirty) return { markup, clickables: clickables.slice(), passes: pass + 1 }
    }
    return { markup: '', clickables: clickables.slice(), passes: 8, overflow: true }
  }

  return { React, render: (element) => renderRoot(element).markup, renderRoot, rerender }
}

// ---------------------------------------------------------------- 浏览器桩

const { React, render, renderRoot, rerender } = createMiniReact()

const registrations = []
const injected = []

const ctx = {
  locale: { getLocale: () => ({ id: 'zh' }) },
  get: () => undefined,
  slots: {
    inject(key, callback) {
      injected.push(key)
      callback()
      return () => {}
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
}

const win = {
  __ModuleLoader__: { load: definition => { win.definition = definition } },
  addEventListener: () => {},
  removeEventListener: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  Audio: function Audio() {
    return { play: () => Promise.resolve(), pause: () => {}, addEventListener: () => {}, volume: 1, currentTime: 0, src: '' }
  },
  AudioContext: function AudioContext() {
    return {
      state: 'running',
      currentTime: 0,
      destination: {},
      resume: () => Promise.resolve(),
      createOscillator: () => ({ connect: () => ({ connect: () => {} }), start: () => {}, stop: () => {}, frequency: {} }),
      createGain: () => ({
        connect: () => ({ connect: () => {} }),
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      }),
    }
  },
}

const doc = {
  body: {},
  visibilityState: 'visible',
  documentElement: { lang: 'zh' },
  addEventListener: () => {},
  removeEventListener: () => {},
}

const fetchCalls = []
const fetchStub = (url, options) => {
  fetchCalls.push({ url: String(url), options: options || {} })
  return Promise.resolve({ json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve('') })
}

const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const runFactory = new Function(
  'window', 'navigator', 'document', 'fetch',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
  'Audio', 'AudioContext',
  source,
)
runFactory(
  win, { language: 'zh-CN' }, doc, fetchStub,
  win.requestAnimationFrame, win.cancelAnimationFrame,
  win.setInterval, win.clearInterval, win.setTimeout, win.clearTimeout,
  win.Audio, win.AudioContext,
)

if (!win.definition) throw new Error('模块没有调用 window.__ModuleLoader__.load')
if (win.definition.id !== 'dsh-yyz-kaka') throw new Error(`模块 id 不对：${win.definition.id}`)

const ReactDOMStub = {
  // 渲染测试里把 portal 摘掉包装直接返回子树，好让宠物真正被渲染一遍
  createPortal: node => node,
}
const fakeRequire = specifier => {
  if (specifier === 'react') return React
  if (specifier === 'react-dom') return ReactDOMStub
  throw new Error(`unexpected require(${specifier})`)
}

const exported = win.definition.factory(fakeRequire)
if (typeof exported.apply !== 'function') throw new Error('exports.apply 不是函数')
if (!Array.isArray(exported.inject) || !exported.inject.includes('slots')) throw new Error('exports.inject 缺少 slots')

exported.apply(ctx)

const petSlot = registrations.find(item => item.options.name === 'conversation.input.overlay')
const settingsSlot = registrations.find(item => item.options.name === 'settings.plugins.tab')
if (!petSlot || !settingsSlot) throw new Error('缺少宠物或设置 tab 槽位')
if (petSlot.options.id !== 'dsh-yyz-kaka-pet') throw new Error(`宠物槽位 id 变了：${petSlot.options.id}`)
if (settingsSlot.options.id !== 'kaka') throw new Error(`设置 tab id 变了：${settingsSlot.options.id}`)

const t = key => key
const petSettings = {
  pet: { enabled: true, size: 80, moodAuto: true, ramble: true },
  voice: { voiceId: 'stella', volume: 0.6, autoRead: true, cache: true, maxBilledChars: 200 },
  notify: { level: 'important' },
  life: { enabled: true, windowStart: '00:00', windowEnd: '08:00', idleHours: 3 },
}

const useSessionsFor = preset => selector => selector({
  byId: { 'session-x': { projectionValues: { agentPreset: preset } } },
})

/** 让组件的 localStorage 读到的当前页签是 view。 */
function setStoredView(view) {
  globalThis.localStorage = {
    getItem: key => (String(key).startsWith('dsh.conversation.') ? JSON.stringify({ view }) : null),
    setItem: () => {},
    removeItem: () => {},
  }
}

// 1) 非咔咔会话：只渲染 0 尺寸锚点
setStoredView('chat')
const idleMarkup = render(React.createElement(petSlot.component, {
  sessionId: 'session-x',
  t,
  initialSettings: petSettings,
  useSessions: useSessionsFor('standard'),
}))
if (idleMarkup.includes('#img')) throw new Error('非咔咔会话不应该渲染宠物图片')
if (!idleMarkup.includes('#span')) throw new Error(`非咔咔会话应该只渲染锚点 span：${idleMarkup.slice(0, 120)}`)

// 2) 咔咔会话 + 对话页签：完整走一遍 render body（样式、心情、气泡）
const kakaRender = renderRoot(React.createElement(petSlot.component, {
  sessionId: 'session-x',
  t,
  initialSettings: petSettings,
  useSessions: useSessionsFor('kaka'),
}))
const kakaMarkup = kakaRender.markup
if (!kakaMarkup.includes('#img')) throw new Error('咔咔会话应该渲染宠物图片')
if (!kakaMarkup.includes('data-kaka-pet')) throw new Error('宠物根节点缺少 data-kaka-pet 标记')
if (!kakaMarkup.includes('#style')) throw new Error('宠物应该带上自己的动画样式')

// 2b) 点击宠物：应该 POST /kaka/poke（这就是"摸她"的副作用）
const clickable = kakaRender.clickables.find(item => item.type === 'div')
if (!clickable) throw new Error('宠物没有可点击的根元素')
fetchCalls.length = 0
clickable.onClick()
if (!fetchCalls.some(call => call.url.includes('/kaka/poke'))) {
  throw new Error('点击宠物没有触发 POST /kaka/poke，实际调用：' + JSON.stringify(fetchCalls.map(c => c.url)))
}
const pokeCall = fetchCalls.find(call => call.url.includes('/kaka/poke'))
if (String(pokeCall.options.method) !== 'POST') throw new Error('戳一戳应该用 POST')
if (!String(pokeCall.options.body || '').includes('session-x')) throw new Error('戳一戳应该带上会话 id')

// 2c) 切到轨迹页签：宠物必须让位
setStoredView('trajectory')
const trajectoryMarkup = render(React.createElement(petSlot.component, {
  sessionId: 'session-x',
  t,
  initialSettings: petSettings,
  useSessions: useSessionsFor('kaka'),
}))
if (trajectoryMarkup.includes('#img')) throw new Error('轨迹页签不应该渲染宠物')
if (!trajectoryMarkup.includes('#span')) throw new Error('轨迹页签应该只留锚点')

// 2d) 关闭宠物：不渲染
setStoredView('chat')
const disabledMarkup = render(React.createElement(petSlot.component, {
  sessionId: 'session-x',
  t,
  initialSettings: { ...petSettings, pet: { ...petSettings.pet, enabled: false } },
  useSessions: useSessionsFor('kaka'),
}))
if (disabledMarkup.includes('#img')) throw new Error('关闭宠物后不应该渲染图片')

// 3) 设置 tab：加载态 + 带数据的完整渲染
const settingsEmpty = render(React.createElement(settingsSlot.component, {
  t,
  close: () => {},
  openSession: () => true,
}))
if (!settingsEmpty.includes('dsc-kaka-settings')) throw new Error(`设置页没有渲染出容器：${settingsEmpty.slice(0, 160)}`)

const settingsMarkup = render(React.createElement(settingsSlot.component, {
  t,
  close: () => {},
  openSession: () => true,
  initialSettings: petSettings,
}))
for (const key of ['group.pet', 'group.voice', 'group.notify', 'group.life', 'group.data', 'row.petEnabled', 'action.selftest', 'row.diary']) {
  if (!settingsMarkup.includes(key)) throw new Error(`设置页缺少分组/行：${key}`)
}

// 4) 图标坞：五个按钮 + 悬停提示
const dockSource = render(React.createElement(petSlot.component, {
  sessionId: 'session-x',
  t,
  initialSettings: petSettings,
  useSessions: useSessionsFor('kaka'),
}))
for (const key of ['dsc-kaka-dock', 'dsc-kaka-ibtn', 'dsc-kaka-tip', 'dock.open']) {
  if (!dockSource.includes(key)) throw new Error('图标坞缺少：' + key)
}

// 4e) 关于页内容：头像、身份、生日、陪伴、八张卡
const aboutMarkup = render(React.createElement(exported.__test.KakaAbout, {
  t,
  data: {
    name: '咔咔',
    species: '螃蟹',
    role: '主人的积极工作助手',
    quote: '钳子准备好了！',
    birthday: Date.parse('2026-11-14T08:00:00+08:00'),
    companionMs: 6300000,
    stats: { turns: 25, diaryDays: 1, dreamCount: 1, memoryChars: 755, voiceCalls: 4, yuan: 0.0099 },
    mood: 'idle',
    phase: 'awake',
  },
}))
for (const key of ['dsc-kaka-hero', 'dsc-kaka-halo', 'dsc-kaka-name', '钳子准备好了', 'about.companion', 'about.birthday', 'about.turns', 'about.memory', 'about.voice', 'mood.idle', 'phase.awake']) {
  if (!aboutMarkup.includes(key)) throw new Error('关于页缺少：' + key)
}
if (!/11 月 14 日/.test(aboutMarkup)) throw new Error('关于页缺少生日日期')

// 4f) 点一下「关于」图标 → 浮层面板真的出现
const petElement = React.createElement(petSlot.component, {
  sessionId: 'session-x',
  t,
  initialSettings: petSettings,
  useSessions: useSessionsFor('kaka'),
})
const firstPass = renderRoot(petElement)
if (firstPass.markup.includes('data-kaka-panel')) throw new Error('默认不应该有面板')
const aboutButton = firstPass.clickables.find(item => item.label === 'dock.open')
if (!aboutButton) throw new Error('找不到入口按钮（aria-label=dock.open）')
aboutButton.onClick()
const secondPass = rerender(petElement)
if (!secondPass.markup.includes('data-kaka-panel')) throw new Error('点了入口按钮之后面板没出现')
if (!secondPass.markup.includes('dsc-kaka-panel-foot')) throw new Error('面板缺少底部状态条')

// 5) 小本子面板：打开某一页时渲染容器、页签与标题
const panelMarkup = render(React.createElement(petSlot.component, {
  sessionId: 'session-x',
  t,
  initialSettings: petSettings,
  initialPanel: 'about',
  useSessions: useSessionsFor('kaka'),
}))
for (const key of ['data-kaka-panel', 'dsc-kaka-panel-tabs', 'dock.about', 'dock.plan', 'dock.memory', 'panel.close']) {
  if (!panelMarkup.includes(key)) throw new Error('小本子面板缺少：' + key)
}

// 4d) 纯函数：切段、解析、日期格式
const helpers = exported.__test
if (!helpers) throw new Error('缺少 __test 纯函数出口')
const proseParts = helpers.splitProse('a\n\nb\n\n\nc')
if (JSON.stringify(proseParts) !== JSON.stringify(['a', 'b', 'c'])) throw new Error('splitProse 结果不对：' + JSON.stringify(proseParts))
const parsed = helpers.parseMemory('## 标题\n- 一\n- 二\n正文')
if (parsed[0].type !== 'heading' || parsed[1].type !== 'list' || parsed[1].items.length !== 2 || parsed[2].type !== 'p') {
  throw new Error('parseMemory 结果不对：' + JSON.stringify(parsed))
}
if (helpers.formatDayTitle('2026-11-14') !== '11 月 14 日') throw new Error('formatDayTitle 结果不对')
if (!/^星期[日一二三四五六]$/.test(helpers.weekdayOf('2026-11-14'))) throw new Error('weekdayOf 结果不对')

console.log('注入槽位 :', injected.join(', '))
console.table(registrations.map(item => ({ slot: item.options.name, id: item.options.id, order: item.options.order })))
console.log('渲染长度 : idle=%d kaka=%d disabled=%d settings(空)=%d settings(满)=%d',
  idleMarkup.length, kakaMarkup.length, disabledMarkup.length, settingsEmpty.length, settingsMarkup.length)
console.log('宠物根标记 : data-kaka-pet %s', kakaMarkup.includes('data-kaka-pet') ? '存在' : '缺失')
console.log('\nCLIENT SMOKE OK')
