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
  let hooks = []
  let cursor = 0

  class Component {
    constructor(props) {
      this.props = props
      this.state = this.constructor.__initialState ? this.constructor.__initialState() : {}
    }

    setState(next) {
      this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
    }
  }

  const React = {
    Component,
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      const flat = children.flat(Infinity)
      // React 会把 children 放进 props.children（类组件里 this.props.children 依赖它）
      const merged = flat.length === 0 ? { ...(props || {}) } : { ...(props || {}), children: flat.length === 1 ? flat[0] : flat }
      return { [ELEMENT]: true, type, props: merged, children: flat }
    },
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      return [hooks[index], () => {}]
    },
    useRef(value) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = { current: value }
      return hooks[index]
    },
    useEffect() { cursor += 1 },
    useMemo(factory) { cursor += 1; return factory() },
    useCallback(fn) { cursor += 1; return fn },
  }

  const clickables = []

  function renderNode(node) {
    if (node === null || node === undefined || node === false || node === true) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(renderNode).join('')
    if (!node[ELEMENT]) return ''

    const { type, props, children } = node

    if (type === React.Fragment) return children.map(renderNode).join('')

    if (typeof type === 'function') {
      const isClass = type.prototype && typeof type.prototype.render === 'function'
      const previousHooks = hooks
      const previousCursor = cursor
      hooks = []
      cursor = 0
      try {
        if (isClass) {
          const instance = new type(props)
          instance.props = props
          if (!instance.state) instance.state = {}
          return renderNode(instance.render())
        }
        return renderNode(type({ ...props, children }))
      } finally {
        hooks = previousHooks
        cursor = previousCursor
      }
    }

    if (typeof props.onClick === 'function') clickables.push({ type: String(type), onClick: props.onClick })

    // 宿主标签：输出 `#tag` + 子节点，属性用 [] 标出来，方便断言
    const attrs = Object.keys(props)
      .filter(key => key !== 'children' && props[key] !== undefined)
      .map(key => {
        const value = props[key]
        if (typeof value === 'string' || typeof value === 'number') return `${key}=${String(value).slice(0, 60)}`
        if (typeof value === 'boolean') return `${key}=${value}`
        return key
      })
    return `#${String(type)}[${attrs.join('|')}]${children.map(renderNode).join('')}`
  }

  function renderRoot(element) {
    clickables.length = 0
    const markup = renderNode(element)
    return { markup, clickables: clickables.slice() }
  }

  return { React, render: renderNode, renderRoot }
}

// ---------------------------------------------------------------- 浏览器桩

const { React, render, renderRoot } = createMiniReact()

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
const viewSlot = registrations.find(item => item.options.name === 'conversation.view')
if (!petSlot || !settingsSlot || !viewSlot) throw new Error('缺少宠物 / 设置 tab / 对话视图槽位')
if (petSlot.options.id !== 'dsh-yyz-kaka-pet') throw new Error(`宠物槽位 id 变了：${petSlot.options.id}`)
if (settingsSlot.options.id !== 'kaka') throw new Error(`设置 tab id 变了：${settingsSlot.options.id}`)
if (viewSlot.options.id !== 'kaka') throw new Error(`对话视图 id 变了：${viewSlot.options.id}`)

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

// 4) 咔咔对话页签：三个分片 + 容器
const viewMarkup = render(React.createElement(viewSlot.component, {
  t,
  sessionId: 'session-x',
}))
for (const key of ['dsc-kaka-view', 'view.diary', 'view.dream', 'view.memory']) {
  if (!viewMarkup.includes(key)) throw new Error(`咔咔页签缺少内容：${key}`)
}

console.log('注入槽位 :', injected.join(', '))
console.table(registrations.map(item => ({ slot: item.options.name, id: item.options.id, order: item.options.order })))
console.log('渲染长度 : idle=%d kaka=%d disabled=%d settings(空)=%d settings(满)=%d',
  idleMarkup.length, kakaMarkup.length, disabledMarkup.length, settingsEmpty.length, settingsMarkup.length)
console.log('宠物根标记 : data-kaka-pet %s', kakaMarkup.includes('data-kaka-pet') ? '存在' : '缺失')
console.log('\nCLIENT SMOKE OK')
