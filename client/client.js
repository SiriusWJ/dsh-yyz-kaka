/*!
 * 咔咔（Kaka）· 浏览器半区
 *
 * 由 @deepseek-ai/dsh-client-modules 扫描 package.json 的 dsh.client 声明后经
 * /plugins 路由下发，作为 __ModuleLoader__ 工厂执行。**手写 CJS**，外部依赖只有
 * 平台种子表里的 react / react-dom。
 *
 * 三件事：
 *   ① 宠物：输入框旁的螃蟹（只在本会话 = 咔咔预设时出现），点击 = 摸她；
 *   ② 出声：轮询宿主发件箱，播语音 / 提示音 / 换心情 / 冒泡；
 *   ③ 设置：Settings 里一个独立的「咔咔」页。
 *
 * 「该不该出声」的判定全部在宿主（lib/index.js），这里只负责"播"。
 */

window.__ModuleLoader__.load({
  id: 'dsh-yyz-kaka',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var React = require('react')
    var ReactDOM = require('react-dom')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var useRef = React.useRef
    var useMemo = React.useMemo
    var useCallback = React.useCallback
    var createPortal = ReactDOM.createPortal

    var PLUGIN_ID = 'dsh-yyz-kaka'
    var PRESET_ID = 'kaka'
    var API = '/kaka'
    var POLL_MS = 1500
    var ASSET = API + '/asset/sprite.png'

    // ============================================================ i18n

    var DICT = {
      zh: {
        'pet.name': '咔咔',
        'pet.idle': '主人有事就喊我',
        'pet.focus': '干活中……钳子夹紧',
        'pet.proud': '咔嚓！干得漂亮',
        'pet.worried': '等你决定呢',
        'pet.tired': '有点困了……',
        'pet.dreaming': '做梦整理记忆中',
        'pet.petted': '嘿嘿，被摸了',
        'pet.sleeping': '呼呼……',
        'pet.busyTip': '咔咔正在干活，不打扰她',
        'pet.pokeTip': '点一下 = 戳戳她',
        'settings.title': '咔咔',
        'settings.subtitle': '宠物、嗓子、提示与作息',
        'view.title': '咔咔',
        'view.diary': '日记',
        'view.dream': '梦',
        'view.memory': '记忆',
        'view.agent': '长记忆',
        'view.user': '主人画像',
        'view.empty': '这里还空着',
        'view.loading': '读取中…',
        'view.hint': '这些都是咔咔自己的小本子，所有咔咔会话共享。',
        'view.chars': '字符',
        'about.tab': '关于',
        'about.companion': '陪伴',
        'about.companionNote': '从第一次开机算起',
        'about.birthday': '生日',
        'about.birthdayNote': '认识主人的第 {n} 天',
        'about.turns': '对话轮次',
        'about.turnsNote': '她记得的每一次',
        'about.memory': '记忆',
        'about.memoryNote': '长记忆 {a} · 画像 {u}',
        'about.diary': '日记',
        'about.diaryNote': '只有她自己的话',
        'about.dream': '梦',
        'about.dreamUnit': '篇',
        'about.dreamNote': '夜里整理出来的',
        'about.voice': '嗓子',
        'about.voiceNote': '{c} 计费字符 · {n} 次',
        'about.mood': '心情',
        'about.moodNote': '音色 {v}',
        'about.days': '天',
        'about.hours': '小时',
        'about.minutes': '分钟',
        'about.tagWarm': '热情',
        'about.tagLoyal': '忠诚',
        'about.tagHonest': '不编造',
        'about.footerData': '数据都在 ~/.dsh/kaka',
        'about.footerShared': '所有咔咔会话共享同一份记忆',
        'about.footerKeep': '卸载插件不会删除',
        'mood.idle': '元气', 'mood.focus': '专注', 'mood.proud': '得意', 'mood.worried': '担心',
        'mood.tired': '疲惫', 'mood.dreaming': '做梦', 'mood.petted': '被摸', 'mood.sleeping': '睡觉',
        'phase.awake': '清醒', 'phase.quiet': '安静', 'phase.diary': '写日记',
        'phase.dreaming': '做梦', 'phase.sleeping': '睡觉',

        'group.pet': '宠物',
        'group.voice': '嗓子',
        'group.notify': '提示',
        'group.life': '作息与记忆',
        'group.data': '数据',
        'row.petEnabled': '显示宠物',
        'row.petEnabled.desc': '在输入框旁边显示咔咔；只有咔咔会话会出现。',
        'row.petSize': '尺寸',
        'row.moodAuto': '心情自动切换',
        'row.moodAuto.desc': '跟随任务状态切换专注 / 得意 / 担心 / 疲惫。',
        'row.ramble': '随机冒泡',
        'row.ramble.desc': '空闲时偶尔说句话（本地文案，不花钱）。',
        'row.voiceId': '音色',
        'row.voiceId.desc': 'DeepSeek 官方 TTS 只有两个音色。',
        'row.volume': '音量',
        'row.autoRead': '自动朗读',
        'row.autoRead.desc': '由咔咔自己判断该念哪一句；关掉后只能手动点她。',
        'row.cache': '语音缓存',
        'row.cache.desc': '同一句话重复合成不再扣费。',
        'row.maxChars': '单条上限',
        'row.maxChars.desc': '计费字符；超出只念首句。汉字算 2 个。',
        'row.billing': '今日计费',
        'voice.missingKey': '未检测到 DEEPSEEK_API_KEY：提示音照常，但暂时不能说话。',
        'row.notifyLevel': '提示音',
        'row.notifyLevel.desc': '重要 = 长任务完成 / 需要决策 / 出错时响。',
        'row.lifeEnabled': '生命线程',
        'row.lifeEnabled.desc': '5 秒一跳，负责作息、闹钟、日记与做梦。',
        'row.window': '作息窗口',
        'row.window.desc': '窗口内长时间没人打扰就会写日记、进入做梦。',
        'row.idleHours': '静默阈值（小时）',
        'row.dreamCompose': '做梦写故事',
        'row.dreamCompose.desc': '做梦时写一篇第一人称的梦；关掉只留记忆整理。',
        'row.dataDir': '数据目录',
        'row.homeSession': '咔咔的家',
        'row.homeSession.desc': '日记与梦投递到这里；第一次需要时会自动创建。',
        'action.openHome': '去她家看看',
        'action.selftest': '自检一下',
        'row.diary': '最近的小本子',
        'action.loadDiary': '翻日记',
        'common.empty': '还没有日记',
        'common.diagLoading': '检查中…',
        'action.forceDream': '立刻做个梦',
        'action.ramble': '让她冒个泡',
        'action.test': '试听',
        'action.testBeep': '听提示音',
        'action.clearAudio': '清空语音缓存',
        'action.clearMemory': '清空记忆',
        'action.clearDiary': '清空日记',
        'action.confirmClear': '再点一次确认',
        'action.reload': '刷新',
        'voice.stella': 'stella 女声',
        'voice.tide': 'tide 男声',
        'notify.off': '禁用',
        'notify.important': '重要',
        'notify.always': '每次',
        'common.on': '开',
        'common.off': '关',
        'common.none': '暂无',
        'common.saved': '已保存',
        'common.error': '出错了',
      },
      en: {
        'pet.name': 'Kaka',
        'pet.idle': 'Call me when needed',
        'pet.focus': 'Working...',
        'pet.proud': 'Crunch! Nice one',
        'pet.worried': 'Waiting on you',
        'pet.tired': 'Getting sleepy...',
        'pet.dreaming': 'Dreaming',
        'pet.petted': 'Hehe, petted',
        'pet.sleeping': 'Zzz...',
        'pet.busyTip': 'Kaka is busy',
        'pet.pokeTip': 'Click to poke her',
        'settings.title': 'Kaka',
        'settings.subtitle': 'Pet, voice, notifications and rhythm',
        'view.title': 'Kaka',
        'view.diary': 'Journal',
        'view.dream': 'Dreams',
        'view.memory': 'Memory',
        'view.agent': 'Long memory',
        'view.user': 'Owner profile',
        'view.empty': 'Nothing here yet',
        'view.loading': 'Loading…',
        'view.hint': "Kaka's own notebooks, shared by every Kaka session.",
        'view.chars': 'chars',
        'about.tab': 'About',
        'about.companion': 'Together',
        'about.companionNote': 'Since her first boot',
        'about.birthday': 'Birthday',
        'about.birthdayNote': 'Day {n} with you',
        'about.turns': 'Turns',
        'about.turnsNote': 'Every one she remembers',
        'about.memory': 'Memory',
        'about.memoryNote': 'Long {a} · Profile {u}',
        'about.diary': 'Journal',
        'about.diaryNote': 'Only her own words',
        'about.dream': 'Dreams',
        'about.dreamUnit': 'night(s)',
        'about.dreamNote': 'Made at night',
        'about.voice': 'Voice',
        'about.voiceNote': '{c} billed chars · {n} calls',
        'about.mood': 'Mood',
        'about.moodNote': 'Voice {v}',
        'about.days': 'd',
        'about.hours': 'h',
        'about.minutes': 'min',
        'about.tagWarm': 'warm',
        'about.tagLoyal': 'loyal',
        'about.tagHonest': 'honest',
        'about.footerData': 'Data lives in ~/.dsh/kaka',
        'about.footerShared': 'Every Kaka session shares one memory',
        'about.footerKeep': 'Uninstalling keeps the data',
        'mood.idle': 'bright', 'mood.focus': 'focused', 'mood.proud': 'proud', 'mood.worried': 'worried',
        'mood.tired': 'tired', 'mood.dreaming': 'dreaming', 'mood.petted': 'petted', 'mood.sleeping': 'sleeping',
        'phase.awake': 'awake', 'phase.quiet': 'quiet', 'phase.diary': 'journaling',
        'phase.dreaming': 'dreaming', 'phase.sleeping': 'sleeping',

        'group.pet': 'Pet',
        'group.voice': 'Voice',
        'group.notify': 'Notifications',
        'group.life': 'Rhythm & memory',
        'group.data': 'Data',
        'row.petEnabled': 'Show pet',
        'row.petEnabled.desc': 'Shows Kaka beside the composer in Kaka sessions only.',
        'row.petSize': 'Size',
        'row.moodAuto': 'Automatic mood',
        'row.moodAuto.desc': 'Follow focus / proud / worried / tired with task state.',
        'row.ramble': 'Random chatter',
        'row.ramble.desc': 'Occasional local line while idle (free).',
        'row.voiceId': 'Voice',
        'row.voiceId.desc': 'DeepSeek TTS ships two voices.',
        'row.volume': 'Volume',
        'row.autoRead': 'Auto read',
        'row.autoRead.desc': 'Kaka decides what to say; off means manual only.',
        'row.cache': 'Audio cache',
        'row.cache.desc': 'Repeating the same line costs nothing.',
        'row.maxChars': 'Per-line cap',
        'row.maxChars.desc': 'Billed characters; longer text reads the first sentence only.',
        'row.billing': 'Today',
        'voice.missingKey': 'No DEEPSEEK_API_KEY found: beeps still work, speech is unavailable.',
        'row.notifyLevel': 'Notification',
        'row.notifyLevel.desc': 'Important = long task done / decision needed / error.',
        'row.lifeEnabled': 'Life thread',
        'row.lifeEnabled.desc': 'A 5s heartbeat driving rhythm, alarms, diary and dreams.',
        'row.window': 'Quiet window',
        'row.window.desc': 'Inside the window, a long silence starts diary then dreaming.',
        'row.idleHours': 'Silence threshold (h)',
        'row.dreamCompose': 'Dream story',
        'row.dreamCompose.desc': 'Write a first-person dream; off keeps only memory tidy-up.',
        'row.dataDir': 'Data directory',
        'row.homeSession': "Kaka's home",
        'row.homeSession.desc': 'Diary and dreams are delivered here; created on demand.',
        'action.openHome': 'Open her home',
        'action.selftest': 'Self-test',
        'row.diary': 'Recent journal',
        'action.loadDiary': 'Read diary',
        'common.empty': 'No diary yet',
        'common.diagLoading': 'Checking…',
        'action.forceDream': 'Dream now',
        'action.ramble': 'Say something',
        'action.test': 'Test',
        'action.testBeep': 'Test sound',
        'action.clearAudio': 'Clear audio cache',
        'action.clearMemory': 'Clear memory',
        'action.clearDiary': 'Clear diary',
        'action.confirmClear': 'Click again to confirm',
        'action.reload': 'Reload',
        'voice.stella': 'stella (female)',
        'voice.tide': 'tide (male)',
        'notify.off': 'Off',
        'notify.important': 'Important',
        'notify.always': 'Every turn',
        'common.on': 'On',
        'common.off': 'Off',
        'common.none': 'None',
        'common.saved': 'Saved',
        'common.error': 'Failed',
      },
    }

    function detectLang(ctx) {
      try {
        var snap = ctx.locale.getLocale()
        var id = String((snap && (snap.id || snap.locale)) || '')
        if (id) return id.toLowerCase().indexOf('en') === 0 ? 'en' : 'zh'
      } catch (err) { /* 没有 locale 服务也能活 */ }
      var nav = String((typeof navigator !== 'undefined' && navigator.language) || 'zh')
      return nav.toLowerCase().indexOf('en') === 0 ? 'en' : 'zh'
    }

    function makeT(lang) {
      return function t(key) {
        var table = DICT[lang] || DICT.zh
        if (table[key] !== undefined) return table[key]
        return DICT.zh[key] !== undefined ? DICT.zh[key] : key
      }
    }

    // ============================================================ 网络

    function getJson(url) {
      return fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' })
        .then(function (res) { return res.json() })
    }

    function postJson(url, body) {
      return fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      }).then(function (res) { return res.json() })
    }

    // ============================================================ 声音

    var audioCtx = null
    function ensureAudioCtx() {
      if (audioCtx) return audioCtx
      var Ctor = window.AudioContext || window.webkitAudioContext
      if (!Ctor) return null
      try { audioCtx = new Ctor() } catch (err) { audioCtx = null }
      return audioCtx
    }

    var BEEP_TONES = {
      done: [[660, 0.08], [880, 0.12], [1100, 0.16]],
      question: [[520, 0.1], [700, 0.12]],
      error: [[300, 0.14], [200, 0.2]],
      attention: [[880, 0.1], [880, 0.1]],
      pet: [[900, 0.05], [1200, 0.06]],
    }

    /** 用 WebAudio 合成一声提示音（零资源、零网络）。 */
    function playBeep(kind) {
      var ctx = ensureAudioCtx()
      if (!ctx) return
      if (ctx.state === 'suspended') ctx.resume().catch(function () {})
      var tones = BEEP_TONES[kind] || BEEP_TONES.done
      var at = ctx.currentTime
      tones.forEach(function (pair) {
        var osc = ctx.createOscillator()
        var gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = pair[0]
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(0.16, at + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + pair[1])
        osc.connect(gain).connect(ctx.destination)
        osc.start(at)
        osc.stop(at + pair[1] + 0.02)
        at += pair[1]
      })
    }

    var player = {
      el: null,
      queue: [],
      volume: 0.6,
      playing: false,
      enqueue: function (url) {
        if (!url) return
        this.queue.push(url)
        this.pump()
      },
      pump: function () {
        if (this.playing || !this.queue.length) return
        var self = this
        var url = this.queue.shift()
        if (!this.el) {
          this.el = new Audio()
          this.el.addEventListener('ended', function () { self.playing = false; self.pump() })
          this.el.addEventListener('error', function () { self.playing = false; self.pump() })
        }
        this.playing = true
        this.el.src = url
        this.el.volume = this.volume
        var promise = this.el.play()
        if (promise && promise.catch) {
          promise.catch(function () { self.playing = false })
        }
      },
      stop: function () {
        this.queue.length = 0
        this.playing = false
        if (this.el) {
          try { this.el.pause() } catch (err) { /* ignore */ }
          this.el.currentTime = 0
        }
      },
    }

    // ============================================================ 宠物视觉

    var MOOD_ANIM = {
      idle: 'dsc-kaka-breathe 3.4s ease-in-out infinite',
      focus: 'dsc-kaka-focus 1.6s ease-in-out infinite',
      proud: 'dsc-kaka-hop 0.55s ease-in-out 3',
      worried: 'dsc-kaka-shake 0.32s ease-in-out infinite',
      tired: 'dsc-kaka-sag 4s ease-in-out infinite',
      dreaming: 'dsc-kaka-sleep 4.2s ease-in-out infinite',
      sleeping: 'dsc-kaka-sleep 4.6s ease-in-out infinite',
      petted: 'dsc-kaka-squish 0.5s ease-out 2',
    }

    var PET_BUBBLES = {
      idle: 'pet.idle',
      focus: 'pet.focus',
      proud: 'pet.proud',
      worried: 'pet.worried',
      tired: 'pet.tired',
      dreaming: 'pet.dreaming',
      sleeping: 'pet.sleeping',
      petted: 'pet.petted',
    }

    var PET_CSS = [
      '@keyframes dsc-kaka-breathe{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-3px) rotate(-1.5deg)}}',
      '@keyframes dsc-kaka-focus{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-2px) rotate(1deg)}}',
      '@keyframes dsc-kaka-hop{0%{transform:translateY(0) scale(1)}35%{transform:translateY(-14px) scale(1.04)}70%{transform:translateY(0) scale(0.97)}100%{transform:translateY(0) scale(1)}}',
      '@keyframes dsc-kaka-shake{0%,100%{transform:translateX(-2px) rotate(-2deg)}50%{transform:translateX(2px) rotate(2deg)}}',
      '@keyframes dsc-kaka-sag{0%,100%{transform:translateY(2px) scaleY(0.97)}50%{transform:translateY(4px) scaleY(0.94)}}',
      '@keyframes dsc-kaka-sleep{0%,100%{transform:translateY(2px) scale(0.98)}50%{transform:translateY(5px) scale(0.95)}}',
      '@keyframes dsc-kaka-squish{0%{transform:scale(1,1)}40%{transform:scale(1.1,0.88)}100%{transform:scale(1,1)}}',
      '@keyframes dsc-kaka-bubble{0%{opacity:0;transform:translateY(4px) scale(.96)}12%{opacity:1;transform:translateY(0) scale(1)}88%{opacity:1}100%{opacity:0;transform:translateY(-4px)}}',
      '@media (prefers-reduced-motion: reduce){[data-kaka-pet] img{animation:none !important}[data-kaka-pet] *{transition:none !important}}',
    ].join('')

    /** 宠物本体：一张精灵图 + CSS 动效，零外部依赖。 */
    function PetSprite(props) {
      var mood = props.mood || 'idle'
      var size = props.size || 80
      var anim = MOOD_ANIM[mood] || MOOD_ANIM.idle
      var filter = mood === 'tired' || mood === 'dreaming' || mood === 'sleeping'
        ? 'saturate(.75) brightness(.92)'
        : 'none'
      return h('img', {
        src: ASSET,
        alt: '咔咔',
        draggable: false,
        style: {
          width: size,
          height: size,
          display: 'block',
          transformOrigin: '50% 100%',
          animation: anim,
          filter: filter,
          userSelect: 'none',
          pointerEvents: 'none',
          imageRendering: '-webkit-optimize-contrast',
        },
      })
    }

    /**
     * 渲染兜底：插件组件抛错时只让这一个槽位空着，绝不把宿主界面搞白。
     * （官方说明：slot entry 抛错会被整块替换成空白，所以兜底必须在插件里做。）
     * 注意必须用真正的 class —— React.Component 是 ES6 class，
     * `React.Component.call(this, props)` 会直接抛 TypeError。
     */
    class PetBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      componentDidCatch(error) {
        try { console.warn('[kaka] 渲染失败，已降级为空白：', error) } catch (err) { /* ignore */ }
      }

      render() {
        if (this.state.failed) return null
        return this.props.children || null
      }
    }

    /** 输入框旁的宠物。只在咔咔会话渲染；点击 = 摸她。 */
    function KakaPet(props) {
      var sessionId = props.sessionId
      var t = props.t

      // 预设判定：宿主官方 agent-preset 标签读的就是这个字段
      var preset = props.useSessions
        ? props.useSessions(function (snapshot) {
          return sessionId && snapshot && snapshot.byId && snapshot.byId[sessionId]
            ? snapshot.byId[sessionId].projectionValues && snapshot.byId[sessionId].projectionValues.agentPreset
            : undefined
        })
        : undefined
      var isKaka = preset === PRESET_ID

      var anchorRef = useRef(null)
      var [rect, setRect] = useState(null)
      var [mood, setMood] = useState('idle')
      var [bubble, setBubble] = useState('')
      // initialSettings 只是给渲染测试用的注入口，真实运行时由 /kaka/profile 拉取
      var [settings, setSettings] = useState(props.initialSettings || null)
      var [busy, setBusy] = useState(false)
      var [hover, setHover] = useState(false)
      // 只有「对话」页签才显示宠物；切到咔咔/轨迹/上下文等页签时让位。
      var [viewId, setViewId] = useState(readViewId(sessionId))
      var cursorRef = useRef(0)
      var bubbleTimer = useRef(null)
      var pokeTimer = useRef(null)
      var sessionRef = useRef(sessionId)
      sessionRef.current = sessionId

      /** 重新拉一次宿主配置（宠物尺寸 / 音量 / 语言等即时设置）。 */
      var refreshProfile = useCallback(function () {
        var sid = sessionRef.current || ''
        return getJson(API + '/profile?session=' + encodeURIComponent(sid))
          .then(function (payload) {
            if (payload && payload.ok) {
              setSettings(payload.settings)
              player.volume = payload.settings.voice.volume
              if (payload.life && payload.life.mood) setMood(payload.life.mood.name)
            }
          })
          .catch(function () {})
      }, [])

      var showBubble = useCallback(function (text, ms) {
        if (!text) return
        setBubble(text)
        if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
        bubbleTimer.current = setTimeout(function () { setBubble('') }, ms || 5200)
      }, [])

      // 位置：测量自己的锚点（不读别人的 DOM），宠物浮在输入框左侧
      useEffect(function () {
        if (!isKaka) return undefined
        var node = anchorRef.current
        if (!node) return undefined
        var update = function () {
          var box = node.getBoundingClientRect()
          if (!box || (box.width === 0 && box.height === 0 && box.top === 0)) return
          setRect({ left: box.left, top: box.top, bottom: box.bottom, width: box.width, height: box.height })
        }
        update()
        var observer = null
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(update)
          observer.observe(node)
        }
        window.addEventListener('resize', update)
        window.addEventListener('scroll', update, true)
        var raf = requestAnimationFrame(function () {
          update()
          raf = requestAnimationFrame(update)
        })
        return function () {
          cancelAnimationFrame(raf)
          if (observer) observer.disconnect()
          window.removeEventListener('resize', update)
          window.removeEventListener('scroll', update, true)
        }
      }, [isKaka])

      // 首次拉一次设置与状态
      useEffect(function () {
        if (!isKaka) return
        getJson(API + '/profile?session=' + encodeURIComponent(sessionId || ''))
          .then(function (payload) {
            if (payload && payload.ok) {
              setSettings(payload.settings)
              player.volume = payload.settings.voice.volume
              if (payload.life && payload.life.mood) setMood(payload.life.mood.name)
              cursorRef.current = payload.life && payload.life.cursor ? payload.life.cursor : 0
            }
          })
          .catch(function () {})
      }, [isKaka, sessionId])

      // 发件箱轮询：语音 / 提示音 / 心情 / 冒泡
      useEffect(function () {
        if (!isKaka) return undefined
        var stopped = false
        var timer = null

        function handle(items) {
          for (var i = 0; i < items.length; i += 1) {
            var item = items[i]
            if (!item) continue
            // 带会话的条目只归那个会话所有：多标签/多会话时不串音
            if (item.session && item.session !== sessionRef.current) continue
            if (item.kind === 'say') player.enqueue(item.audioUrl)
            else if (item.kind === 'beep') playBeep(item.sound)
            else if (item.kind === 'mood') {
              setMood(item.mood || 'idle')
              if (item.mood === 'proud') showBubble(t('pet.proud'))
            } else if (item.kind === 'bubble') showBubble(item.text)
            else if (item.kind === 'settings') refreshProfile()
            else if (item.kind === 'stop') player.stop()
          }
        }

        function poll() {
          if (stopped) return
          if (document.visibilityState === 'hidden') {
            timer = setTimeout(poll, POLL_MS * 3)
            return
          }
          getJson(API + '/voice/pending?after=' + cursorRef.current)
            .then(function (payload) {
              if (stopped || !payload || !payload.ok) return
              if (typeof payload.cursor === 'number') cursorRef.current = payload.cursor
              if (Array.isArray(payload.items) && payload.items.length) handle(payload.items)
            })
            .catch(function () {})
            .then(function () {
              if (!stopped) timer = setTimeout(poll, POLL_MS)
            })
        }

        timer = setTimeout(poll, 400)
        return function () {
          stopped = true
          if (timer) clearTimeout(timer)
        }
      }, [isKaka, sessionId, showBubble, t, refreshProfile])

      // 心情自动回落：petted/proud 之后回到 idle
      useEffect(function () {
        if (mood !== 'petted' && mood !== 'proud') return undefined
        var timer = setTimeout(function () { setMood('idle') }, 4200)
        return function () { clearTimeout(timer) }
      }, [mood])

      useEffect(function () {
        return function () {
          if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
          if (pokeTimer.current) clearTimeout(pokeTimer.current)
        }
      }, [])

      var onPoke = useCallback(function () {
        if (!sessionId) return
        // 当下就给反馈，不等网络
        setMood('petted')
        showBubble(t('pet.petted'))
        playBeep('pet')
        postJson(API + '/poke', { sessionId: sessionId })
          .then(function (payload) { setBusy(!!(payload && payload.reason === 'busy')) })
          .catch(function () {})
      }, [sessionId, showBubble, t])

      // 页签同步：对话 shell 把选中的 view 存在 localStorage，轮询一下即可跟随
      useEffect(function () {
        if (!isKaka) return undefined
        var timer = setInterval(function () {
          setViewId(function (current) {
            var next = kakaTabOpen ? 'kaka' : readViewId(sessionId)
            return next === current ? current : next
          })
        }, 800)
        return function () { clearInterval(timer) }
      }, [isKaka, sessionId])

      var showPet = isKaka && viewId === 'chat' && !kakaTabOpen
      if (!showPet) {
        // 非咔咔会话 / 不在「对话」页签：只留一个 0 尺寸锚点
        return h('span', { ref: anchorRef, style: { display: 'inline-block', width: 0, height: 0 } })
      }
      if (!settings || !settings.pet || settings.pet.enabled === false) {
        return h('span', { ref: anchorRef, style: { display: 'inline-block', width: 0, height: 0 } })
      }

      var size = settings.pet.size || 80
      var style = { position: 'fixed', zIndex: 40, display: 'flex', alignItems: 'flex-end', gap: 0 }
      if (rect) {
        var left = Math.round(rect.left - size - 14)
        var top = Math.round(rect.top + rect.height / 2 - size * 0.62)
        if (left < 12) left = Math.round(rect.left + 6)
        if (top < 8) top = 8
        style.left = left + 'px'
        style.top = top + 'px'
      } else {
        style.left = '12px'
        style.bottom = '120px'
      }

      var bubbleKey = PET_BUBBLES[mood] ? t(PET_BUBBLES[mood]) : ''
      var bubbleText = bubble || bubbleKey

      var petNode = h('div', {
        style: style,
        'data-kaka-pet': 'true',
      },
      h('div', {
        role: 'button',
        tabIndex: 0,
        title: busy ? t('pet.busyTip') : t('pet.pokeTip'),
        'aria-label': t('pet.name'),
        onClick: onPoke,
        onMouseEnter: function () { setHover(true) },
        onMouseLeave: function () { setHover(false) },
        onFocus: function () { setHover(true) },
        onBlur: function () { setHover(false) },
        onKeyDown: function (event) {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPoke() }
        },
        style: {
          width: size,
          height: size,
          cursor: 'pointer',
          position: 'relative',
          pointerEvents: 'auto',
          transition: 'transform .18s cubic-bezier(.2,.8,.3,1), filter .18s ease',
          transform: hover ? 'translateY(-3px) scale(1.06)' : 'translateY(0) scale(1)',
          filter: hover
            ? 'drop-shadow(0 10px 16px rgba(0,0,0,.28))'
            : 'drop-shadow(0 6px 10px rgba(0,0,0,.22))',
        },
      },
      h(PetSprite, { mood: mood, size: size }),
      bubbleText
        ? h('div', {
          style: {
            position: 'absolute',
            left: '50%',
            bottom: 'calc(100% - 6px)',
            transform: 'translateX(-50%)',
            maxWidth: 200,
            padding: '6px 10px',
            borderRadius: 12,
            background: 'var(--dsw-alias-bg-overlay, rgba(32,32,36,.94))',
            color: 'var(--dsw-alias-label-primary, #fff)',
            fontSize: 12,
            lineHeight: '17px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.14))',
            boxShadow: '0 8px 24px rgba(0,0,0,.28)',
            animation: 'dsc-kaka-bubble 5.2s ease forwards',
            pointerEvents: 'none',
          },
        }, bubbleText)
        : null,
      ))

      return h(React.Fragment, null,
        h('span', { ref: anchorRef, style: { display: 'inline-block', width: 0, height: 0 } }),
        h('style', null, PET_CSS),
        createPortal(petNode, document.body),
      )
    }

    // ============================================================ 设置页

    var SETTINGS_CSS = [
      '.dsc-kaka-settings{display:flex;flex-direction:column;gap:18px;padding:4px 2px 24px}',
      '.dsc-kaka-head{display:flex;align-items:baseline;gap:10px}',
      '.dsc-kaka-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dsc-kaka-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-group{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
      '.dsc-kaka-group-title{padding:10px 14px;font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}',
      '.dsc-kaka-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsc-kaka-row:first-of-type{border-top:none}',
      '.dsc-kaka-label{font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.dsc-kaka-desc{font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);margin-top:2px;max-width:420px}',
      '.dsc-kaka-control{display:flex;align-items:center;gap:8px;flex-shrink:0}',
      '.dsc-kaka-switch{position:relative;width:36px;height:20px;border-radius:999px;border:none;cursor:pointer;background:var(--dsw-alias-state-idle-primary);transition:background .16s}',
      '.dsc-kaka-switch[data-on="true"]{background:var(--dsw-alias-brand-primary)}',
      '.dsc-kaka-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .16s}',
      '.dsc-kaka-switch[data-on="true"] .dsc-kaka-thumb{transform:translateX(16px)}',
      '.dsc-kaka-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;overflow:hidden}',
      '.dsc-kaka-seg button{border:none;background:transparent;padding:5px 11px;font-size:12px;cursor:pointer;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-seg button[data-active="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dsc-kaka-num{width:72px;padding:5px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px}',
      '.dsc-kaka-text{width:88px;padding:5px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px}',
      '.dsc-kaka-btn{padding:5px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}',
      '.dsc-kaka-btn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dsc-kaka-btn[data-danger="true"]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.dsc-kaka-btn[data-pending="true"]{background:var(--dsw-alias-state-error-primary);color:#fff}',
      '.dsc-kaka-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all;max-width:360px;text-align:right}',
      '.dsc-kaka-hint{font-size:11px;color:var(--dsw-alias-label-secondary);text-align:right;margin-top:2px}',
      '.dsc-kaka-diary{white-space:pre-wrap;font-size:12px;line-height:19px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;max-height:220px;overflow:auto;margin:0 14px 14px}',
    ].join('')

    function Switch(props) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': !!props.checked,
        'data-on': props.checked ? 'true' : 'false',
        className: 'dsc-kaka-switch',
        onClick: function () { props.onChange(!props.checked) },
      }, h('span', { className: 'dsc-kaka-thumb' }))
    }

    function Segmented(props) {
      return h('div', { className: 'dsc-kaka-seg' }, (props.options || []).map(function (option) {
        return h('button', {
          key: option.value,
          type: 'button',
          'data-active': String(props.value) === String(option.value) ? 'true' : 'false',
          onClick: function () { props.onChange(option.value) },
        }, option.label)
      }))
    }

    function Row(props) {
      return h('div', { className: 'dsc-kaka-row' },
        h('div', null,
          h('div', { className: 'dsc-kaka-label' }, props.label),
          props.desc ? h('div', { className: 'dsc-kaka-desc' }, props.desc) : null),
        h('div', { className: 'dsc-kaka-control' }, props.children))
    }

    function Group(props) {
      return h('section', { className: 'dsc-kaka-group' },
        h('div', { className: 'dsc-kaka-group-title' }, props.title),
        props.children)
    }

    function KakaSettings(props) {
      var t = props.t
      // initialSettings 是渲染测试用的注入口；真实运行由 /kaka/profile 拉取
      var [settings, setSettings] = useState(props.initialSettings || null)
      var [meta, setMeta] = useState(null)
      var [savedAt, setSavedAt] = useState(0)
      var [error, setError] = useState('')
      var [confirm, setConfirm] = useState('')
      var [diag, setDiag] = useState('')
      var [diaryDays, setDiaryDays] = useState([])
      var [diaryText, setDiaryText] = useState('')
      var [diaryDay, setDiaryDay] = useState('')
      var saveTimer = useRef(null)

      /** 读日记：先列最近的天，再按天取正文。 */
      var loadDiary = useCallback(function (day) {
        if (!day) {
          getJson(API + '/diaries')
            .then(function (payload) {
              if (payload && payload.ok) setDiaryDays(payload.days || [])
            })
            .catch(function () {})
          return
        }
        setDiaryDay(day)
        getJson(API + '/diaries?date=' + encodeURIComponent(day))
          .then(function (payload) {
            if (payload && payload.ok) setDiaryText(payload.text || '')
          })
          .catch(function () {})
      }, [])

      useEffect(function () { loadDiary() }, [loadDiary])

      /** 自检：把 /kaka/selftest 的结果压成一行人话。 */
      var runSelftest = useCallback(function () {
        setDiag(t('common.diagLoading'))
        getJson(API + '/selftest')
          .then(function (payload) {
            var checks = payload && payload.checks
            if (!checks) { setDiag(t('common.error')); return }
            var parts = []
            parts.push(t('row.dataDir') + ':' + (checks.dataDir && checks.dataDir.writable ? 'OK' : 'FAIL'))
            parts.push('memory:' + (checks.memory && checks.memory.agent ? 'OK' : 'FAIL'))
            parts.push('home:' + (checks.home && checks.home.exists ? 'OK' : 'FAIL'))
            parts.push('voice:' + (checks.voice && checks.voice.available ? 'OK' : 'off'))
            parts.push('tick:' + (checks.tick && checks.tick.lastTickAgoMs != null ? Math.round(checks.tick.lastTickAgoMs / 1000) + 's' : '?'))
            setDiag(parts.join(' · '))
          })
          .catch(function (err) { setDiag(String(err && err.message || err)) })
      }, [setDiag, t])

      useEffect(function () {
        getJson(API + '/profile')
          .then(function (payload) {
            if (payload && payload.ok) {
              setSettings(payload.settings)
              setMeta({ billing: payload.billing, audio: payload.audio, homeSessionId: payload.homeSessionId, voiceAvailable: payload.voiceAvailable })
            }
          })
          .catch(function (err) { setError(String(err && err.message || err)) })
      }, [])

      var persist = useCallback(function (next) {
        setSettings(next)
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(function () {
          postJson(API + '/settings', { settings: next })
            .then(function (payload) {
              if (payload && payload.ok) {
                setSettings(payload.settings)
                setSavedAt(Date.now())
                setError('')
              } else {
                setError(String(payload && payload.error || 'save failed'))
              }
            })
            .catch(function (err) { setError(String(err && err.message || err)) })
        }, 220)
      }, [])

      useEffect(function () {
        return function () { if (saveTimer.current) clearTimeout(saveTimer.current) }
      }, [])

      if (!settings) {
        return h('div', { className: 'dsc-kaka-settings' },
          h('style', null, SETTINGS_CSS),
          h('div', { className: 'dsc-kaka-sub' }, error || '…'))
      }

      function patch(section, key, value) {
        var next = JSON.parse(JSON.stringify(settings))
        next[section][key] = value
        persist(next)
      }

      function doConfirm(action, run) {
        if (confirm !== action) {
          setConfirm(action)
          setTimeout(function () { setConfirm(function (current) { return current === action ? '' : current }) }, 4000)
          return
        }
        setConfirm('')
        run()
      }

      var savedLabel = savedAt ? t('common.saved') : ''

      return h('div', { className: 'dsc-kaka-settings' },
        h('style', null, SETTINGS_CSS),

        h('div', { className: 'dsc-kaka-head' },
          h('div', { className: 'dsc-kaka-title' }, t('settings.title')),
          h('div', { className: 'dsc-kaka-sub' }, t('settings.subtitle')),
          savedLabel ? h('div', { className: 'dsc-kaka-sub' }, '· ' + savedLabel) : null,
          error ? h('div', { className: 'dsc-kaka-sub', style: { color: 'var(--dsw-alias-state-error-primary)' } }, '· ' + error) : null),

        h(Group, { title: t('group.pet') },
          h(Row, { label: t('row.petEnabled'), desc: t('row.petEnabled.desc') },
            h(Switch, { checked: !!settings.pet.enabled, onChange: function (v) { patch('pet', 'enabled', v) } })),
          h(Row, { label: t('row.petSize') },
            h(Segmented, {
              value: settings.pet.size,
              options: [64, 80, 96, 112].map(function (size) { return { value: size, label: size + 'px' } }),
              onChange: function (v) { patch('pet', 'size', Number(v)) },
            })),
          h(Row, { label: t('row.moodAuto'), desc: t('row.moodAuto.desc') },
            h(Switch, { checked: !!settings.pet.moodAuto, onChange: function (v) { patch('pet', 'moodAuto', v) } })),
          h(Row, { label: t('row.ramble'), desc: t('row.ramble.desc') },
            h(Switch, { checked: !!settings.pet.ramble, onChange: function (v) { patch('pet', 'ramble', v) } }))),

        h(Group, { title: t('group.voice') },
          meta && meta.voiceAvailable === false
            ? h('div', {
              className: 'dsc-kaka-row',
              style: { color: 'var(--dsw-alias-state-warn-primary)', fontSize: 12 },
            }, t('voice.missingKey'))
            : null,
          h(Row, { label: t('row.voiceId'), desc: t('row.voiceId.desc') },
            h(Segmented, {
              value: settings.voice.voiceId,
              options: [
                { value: 'stella', label: t('voice.stella') },
                { value: 'tide', label: t('voice.tide') },
              ],
              onChange: function (v) { patch('voice', 'voiceId', v) },
            })),
          h(Row, { label: t('row.volume') },
            h('input', {
              type: 'range', min: 0, max: 1, step: 0.05,
              value: settings.voice.volume,
              style: { width: 120 },
              onChange: function (event) {
                player.volume = Number(event.target.value)
                patch('voice', 'volume', Number(event.target.value))
              },
            })),
          h(Row, { label: t('row.autoRead'), desc: t('row.autoRead.desc') },
            h(Switch, { checked: !!settings.voice.autoRead, onChange: function (v) { patch('voice', 'autoRead', v) } })),
          h(Row, { label: t('row.cache'), desc: t('row.cache.desc') },
            h(Switch, { checked: !!settings.voice.cache, onChange: function (v) { patch('voice', 'cache', v) } })),
          h(Row, { label: t('row.maxChars'), desc: t('row.maxChars.desc') },
            h('input', {
              type: 'number', min: 40, max: 10000, step: 20,
              className: 'dsc-kaka-num',
              value: settings.voice.maxBilledChars,
              onChange: function (event) { patch('voice', 'maxBilledChars', Number(event.target.value) || 200) },
            })),
          h(Row, { label: t('row.billing') },
            h('div', { className: 'dsc-kaka-hint' },
              meta && meta.billing
                ? (meta.billing.chars + ' 字符 · ' + meta.billing.calls + ' 次 · ¥' + meta.billing.yuan)
                : '—')),
          h(Row, { label: t('action.test') },
            h('button', {
              type: 'button', className: 'dsc-kaka-btn',
              onClick: function () {
                postJson(API + '/say', { text: '钳子准备好了！咔嚓！' }).catch(function () {})
              },
            }, t('action.test')),
            h('button', {
              type: 'button', className: 'dsc-kaka-btn',
              onClick: function () { postJson(API + '/audio/clear', {}).catch(function () {}) },
            }, t('action.clearAudio')))),

        h(Group, { title: t('group.notify') },
          h(Row, { label: t('row.notifyLevel'), desc: t('row.notifyLevel.desc') },
            h(Segmented, {
              value: settings.notify.level,
              options: [
                { value: 'off', label: t('notify.off') },
                { value: 'important', label: t('notify.important') },
                { value: 'always', label: t('notify.always') },
              ],
              onChange: function (v) { patch('notify', 'level', v) },
            })),
          h(Row, { label: t('action.testBeep') },
            h('button', {
              type: 'button', className: 'dsc-kaka-btn',
              onClick: function () { postJson(API + '/beep', { sound: 'done' }).catch(function () {}) },
            }, t('action.testBeep')))),

        h(Group, { title: t('group.life') },
          h(Row, { label: t('row.lifeEnabled'), desc: t('row.lifeEnabled.desc') },
            h(Switch, { checked: !!settings.life.enabled, onChange: function (v) { patch('life', 'enabled', v) } })),
          h(Row, { label: t('row.window'), desc: t('row.window.desc') },
            h('input', {
              className: 'dsc-kaka-text', value: settings.life.windowStart,
              onChange: function (event) { patch('life', 'windowStart', event.target.value) },
            }),
            h('span', { className: 'dsc-kaka-sub' }, '→'),
            h('input', {
              className: 'dsc-kaka-text', value: settings.life.windowEnd,
              onChange: function (event) { patch('life', 'windowEnd', event.target.value) },
            })),
          h(Row, { label: t('row.idleHours') },
            h('input', {
              type: 'number', min: 1, max: 8, step: 1,
              className: 'dsc-kaka-num', value: settings.life.idleHours,
              onChange: function (event) { patch('life', 'idleHours', Number(event.target.value) || 3) },
            })),
          h(Row, { label: t('row.dreamCompose'), desc: t('row.dreamCompose.desc') },
            h(Switch, { checked: !!settings.life.dreamCompose, onChange: function (v) { patch('life', 'dreamCompose', v) } }))),

        h(Group, { title: t('group.data') },
          h(Row, { label: t('row.homeSession'), desc: t('row.homeSession.desc') },
            h('div', { className: 'dsc-kaka-mono' }, meta && meta.homeSessionId ? meta.homeSessionId : t('common.none')),
            h('button', {
              type: 'button',
              className: 'dsc-kaka-btn',
              onClick: function () {
                postJson(API + '/home', {})
                  .then(function (payload) {
                    if (!payload || !payload.ok) return
                    setMeta(function (current) {
                      return Object.assign({}, current || {}, { homeSessionId: payload.sessionId })
                    })
                    if (props.openSession && !props.openSession(payload.sessionId)) {
                      setError(t('common.error'))
                    }
                  })
                  .catch(function (err) { setError(String(err && err.message || err)) })
              },
            }, t('action.openHome'))),
          h(Row, { label: t('row.diary') },
            h('div', { className: 'dsc-kaka-seg' },
              (diaryDays.length ? diaryDays.slice(0, 3) : ['']).map(function (day, index) {
                return h('button', {
                  key: day || 'empty',
                  type: 'button',
                  'data-active': String(diaryDay) === String(day) ? 'true' : 'false',
                  onClick: function () { loadDiary(day || '') },
                }, day || t('action.loadDiary'))
              }))),
          diaryText
            ? h('pre', { className: 'dsc-kaka-diary' }, diaryText)
            : (diaryDay ? h('pre', { className: 'dsc-kaka-diary' }, t('common.empty')) : null),
          h(Row, { label: t('action.selftest'), desc: diag || t('row.homeSession.desc') },
            h('button', {
              type: 'button', className: 'dsc-kaka-btn',
              onClick: runSelftest,
            }, t('action.selftest')),
            h('button', {
              type: 'button', className: 'dsc-kaka-btn',
              onClick: function () { postJson(API + '/life/force', { kind: 'ramble' }).catch(function () {}) },
            }, t('action.ramble'))),
          h(Row, { label: t('action.forceDream') },
            h('button', {
              type: 'button', className: 'dsc-kaka-btn',
              onClick: function () { postJson(API + '/life/force', { kind: 'dream' }).catch(function () {}) },
            }, t('action.forceDream'))),
          h(Row, { label: t('action.clearMemory') },
            h('button', {
              type: 'button', className: 'dsc-kaka-btn',
              'data-danger': 'true',
              'data-pending': confirm === 'memory' ? 'true' : 'false',
              onClick: function () { doConfirm('memory', function () { postJson(API + '/memory/clear', {}).catch(function () {}) }) },
            }, confirm === 'memory' ? t('action.confirmClear') : t('action.clearMemory'))),
          h(Row, { label: t('action.clearDiary') },
            h('button', {
              type: 'button', className: 'dsc-kaka-btn',
              'data-danger': 'true',
              'data-pending': confirm === 'diary' ? 'true' : 'false',
              onClick: function () { doConfirm('diary', function () { postJson(API + '/diary/clear', {}).catch(function () {}) }) },
            }, confirm === 'diary' ? t('action.confirmClear') : t('action.clearDiary')))),
      )
    }

    // ============================================================ 咔咔页签（对话视图）

    /** 当前会话选中的对话页签；null 或缺失都表示默认的「对话」。 */
    function readViewId(sessionId) {
      try {
        if (typeof localStorage === 'undefined' || !sessionId) return 'chat'
        var raw = localStorage.getItem('dsh.conversation.' + sessionId)
        if (!raw) return 'chat'
        var parsed = JSON.parse(raw)
        return parsed && typeof parsed.view === 'string' ? parsed.view : 'chat'
      } catch (err) {
        return 'chat'
      }
    }

    /** 咔咔页签打开时置位：宠物要立刻让位，不必等轮询。 */
    var kakaTabOpen = false

    /** apply 里装配的视图登记器（同时供渲染测试调用）。 */
    var kakaViewRegistrar = null

    var VIEW_CSS = [
      '.dsc-kaka-view{display:flex;flex-direction:column;gap:14px;height:100%;width:100%;box-sizing:border-box;padding:20px 24px 8px;color:var(--dsw-alias-label-primary)}',
      '.dsc-kaka-view-head{display:flex;align-items:center;gap:12px}',
      '.dsc-kaka-view-avatar{width:38px;height:38px;flex-shrink:0;filter:drop-shadow(0 3px 5px rgba(0,0,0,.18))}',
      '.dsc-kaka-view-titles{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.dsc-kaka-view-title{font-size:15px;font-weight:650;letter-spacing:.01em}',
      '.dsc-kaka-view-sub{font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-view-tabs{margin-left:auto;display:inline-flex;gap:2px;padding:3px;border-radius:11px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}',
      '.dsc-kaka-tab{border:none;background:transparent;padding:5px 13px;border-radius:8px;font-size:12.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;font-family:inherit}',
      '.dsc-kaka-tab.is-active{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.10)}',
      '.dsc-kaka-view-chips{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
      '.dsc-kaka-chip{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;padding:4px 11px;border-radius:999px;cursor:pointer;font-family:inherit}',
      '.dsc-kaka-chip.is-active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);font-weight:600}',
      '.dsc-kaka-view-count{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-paper{position:relative;flex:1;overflow:auto;width:100%;max-width:860px;margin:0 auto;padding:26px 30px 30px;border-radius:16px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 2px 12px rgba(0,0,0,.06);box-sizing:border-box}',
      '.dsc-kaka-paper::before{content:"";position:absolute;left:0;top:20px;bottom:20px;width:2px;border-radius:2px;background:var(--dsw-alias-brand-primary);opacity:.45}',
      '.dsc-kaka-paper-meta{display:flex;align-items:baseline;gap:8px;margin:0 0 16px;padding-bottom:12px;border-bottom:1px dashed var(--dsw-alias-border-l1)}',
      '.dsc-kaka-paper-date{font-size:17px;font-weight:650;letter-spacing:.01em}',
      '.dsc-kaka-paper-week{font-size:11.5px;color:var(--dsw-alias-label-secondary);letter-spacing:.06em}',
      '.dsc-kaka-prose p{margin:0 0 1.05em;font-size:13.5px;line-height:1.95;color:var(--dsw-alias-label-primary)}',
      '.dsc-kaka-prose p:last-child{margin-bottom:0}',
      '.dsc-kaka-prose p.dsc-kaka-lead::first-letter{font-size:1.5em;font-weight:600;color:var(--dsw-alias-brand-primary)}',
      '.dsc-kaka-prose h3{margin:18px 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--dsw-alias-brand-primary);opacity:.9}',
      '.dsc-kaka-prose h3:first-child{margin-top:0}',
      '.dsc-kaka-prose ul{margin:0 0 1em;padding-left:18px}',
      '.dsc-kaka-prose li{font-size:13px;line-height:1.85;margin:0 0 .35em;color:var(--dsw-alias-label-primary)}',
      '.dsc-kaka-view-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;height:100%;min-height:240px;color:var(--dsw-alias-label-secondary);font-size:12.5px}',
      '.dsc-kaka-view-empty img{width:64px;height:64px;opacity:.42}',
      '.dsc-kaka-skel{display:flex;flex-direction:column;gap:13px;padding:8px 2px}',
      '.dsc-kaka-skel i{display:block;height:11px;border-radius:6px;background:linear-gradient(90deg,var(--dsw-alias-bg-layer-2) 25%,var(--dsw-alias-border-l1) 50%,var(--dsw-alias-bg-layer-2) 75%);background-size:200% 100%;animation:dsc-kaka-shimmer 1.4s linear infinite}',
      '@keyframes dsc-kaka-shimmer{0%{background-position:180% 0}100%{background-position:-80% 0}}',
      /* ── 关于咔咔 ── */
      '.dsc-kaka-hero{display:flex;align-items:center;gap:20px;padding-bottom:18px;border-bottom:1px dashed var(--dsw-alias-border-l1)}',
      '.dsc-kaka-halo{position:relative;width:104px;height:104px;flex-shrink:0;display:grid;place-items:center}',
      '.dsc-kaka-halo img{position:relative;width:92px;height:92px;filter:drop-shadow(0 6px 12px rgba(0,0,0,.22))}',
      '.dsc-kaka-halo::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 50% 55%, color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent), transparent 68%)}',
      '.dsc-kaka-names{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dsc-kaka-name{margin:0;font-size:24px;font-weight:700;letter-spacing:.01em}',
      '.dsc-kaka-role{font-size:12.5px;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}',
      '.dsc-kaka-pill{font-size:11.5px;padding:3px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-pill.is-brand{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)}',
      '.dsc-kaka-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(148px, 1fr));gap:10px;margin-top:18px}',
      '.dsc-kaka-cell{padding:11px 12px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}',
      '.dsc-kaka-cell-k{font-size:10.5px;letter-spacing:.10em;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-cell-v{font-size:16.5px;font-weight:650;margin-top:5px;white-space:nowrap;letter-spacing:.01em}',
      '.dsc-kaka-cell-n{font-size:10.5px;line-height:15px;color:var(--dsw-alias-label-secondary);margin-top:2px}',
      '.dsc-kaka-foot{display:flex;gap:16px;flex-wrap:wrap;margin-top:20px;padding-top:14px;border-top:1px dashed var(--dsw-alias-border-l1);font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-foot b{color:var(--dsw-alias-label-primary);font-weight:600}',
    ].join('')

    var WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

    var MOOD_KEYS = {
      idle: 'mood.idle', focus: 'mood.focus', proud: 'mood.proud', worried: 'mood.worried',
      tired: 'mood.tired', dreaming: 'mood.dreaming', petted: 'mood.petted', sleeping: 'mood.sleeping',
    }

    var PHASE_KEYS = {
      awake: 'phase.awake', quiet: 'phase.quiet', diary: 'phase.diary',
      dreaming: 'phase.dreaming', sleeping: 'phase.sleeping',
    }

    /** 'YYYY-MM-DD' → '11 月 14 日'。 */
    function formatDayTitle(day) {
      var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''))
      if (!match) return day || ''
      return Number(match[2]) + ' 月 ' + Number(match[3]) + ' 日'
    }

    /** 'YYYY-MM-DD' → '星期五'。 */
    function weekdayOf(day) {
      var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''))
      if (!match) return ''
      var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0)
      return WEEKDAYS[date.getDay()] || ''
    }

    /** 时间戳 → '11 月 14 日'。 */
    function formatBirthday(stamp) {
      var date = new Date(Number(stamp) || Date.now())
      return (date.getMonth() + 1) + ' 月 ' + date.getDate() + ' 日'
    }

    /** 毫秒 → '1 天 2 小时' / '3 小时 5 分钟' / '5 分钟'。 */
    function formatDuration(ms, t) {
      var minutes = Math.max(0, Math.floor(Number(ms || 0) / 60000))
      var days = Math.floor(minutes / 1440)
      var hours = Math.floor((minutes % 1440) / 60)
      var rest = minutes % 60
      if (days > 0) return days + ' ' + t('about.days') + ' ' + hours + ' ' + t('about.hours')
      if (hours > 0) return hours + ' ' + t('about.hours') + ' ' + rest + ' ' + t('about.minutes')
      return rest + ' ' + t('about.minutes')
    }

    /** 日记/梦正文：按空行切段。 */
    function splitProse(text) {
      return String(text || '')
        .split(/\n{2,}/)
        .map(part => part.trim())
        .filter(Boolean)
    }

    /** 记忆正文：把 Markdown 的标题/列表/段落转成渲染块。 */
    function parseMemory(text) {
      var blocks = []
      var list = null
      for (var raw of String(text || '').split('\n')) {
        var line = raw.replace(/\s+$/, '')
        if (!line.trim()) { list = null; continue }
        var heading = /^#{1,4}\s+(.*)$/.exec(line)
        if (heading) {
          list = null
          blocks.push({ type: 'heading', text: heading[1].trim() })
          continue
        }
        var bullet = /^\s*[-*]\s+(.*)$/.exec(line)
        if (bullet) {
          if (!list) { list = { type: 'list', items: [] }; blocks.push(list) }
          list.items.push(bullet[1].trim())
          continue
        }
        list = null
        blocks.push({ type: 'p', text: line.trim() })
      }
      return blocks
    }

    /** 关于咔咔：头像、身份、生日、陪伴时长与攒下的小统计。 */
    function KakaAbout(props) {
      var t = props.t
      var data = props.data
      if (!data) {
        return h('div', { className: 'dsc-kaka-skel' },
          h('i', { style: { width: '60%' } }),
          h('i', { style: { width: '92%' } }),
          h('i', { style: { width: '84%' } }))
      }

      var stats = data.stats || {}
      var birthday = Number(data.birthday) || Date.now()
      var days = Math.max(1, Math.floor((Date.now() - birthday) / 86400000) + 1)
      var moodLabel = t(MOOD_KEYS[data.mood] || 'mood.idle')
      var phaseLabel = t(PHASE_KEYS[data.phase] || 'phase.awake')

      var cells = [
        { k: t('about.companion'), v: formatDuration(data.companionMs, t), n: t('about.companionNote') },
        { k: t('about.birthday'), v: formatBirthday(birthday), n: t('about.birthdayNote').replace('{n}', String(days)) },
        { k: t('about.turns'), v: String(stats.turns || 0), n: t('about.turnsNote') },
        { k: t('about.memory'), v: (stats.memoryChars || 0) + ' ' + t('view.chars'), n: t('about.memoryNote').replace('{a}', String(stats.memoryAgent || 0)).replace('{u}', String(stats.memoryUser || 0)) },
        { k: t('about.diary'), v: (stats.diaryDays || 0) + ' ' + t('about.days'), n: t('about.diaryNote') },
        { k: t('about.dream'), v: (stats.dreamCount || 0) + ' ' + t('about.dreamUnit'), n: t('about.dreamNote') },
        { k: t('about.voice'), v: '¥' + (stats.yuan || 0), n: t('about.voiceNote').replace('{c}', String(stats.billedChars || 0)).replace('{n}', String(stats.voiceCalls || 0)) },
        { k: t('about.mood'), v: moodLabel + ' · ' + phaseLabel, n: t('about.moodNote').replace('{v}', String(data.voice || '')) },
      ]

      return h(React.Fragment, null,
        h('div', { className: 'dsc-kaka-hero' },
          h('div', { className: 'dsc-kaka-halo' }, h('img', { src: ASSET, alt: '' })),
          h('div', { className: 'dsc-kaka-names' },
            h('h1', { className: 'dsc-kaka-name' }, data.name || t('view.title')),
            h('div', { className: 'dsc-kaka-role' }, (data.species || '') + ' · ' + (data.role || '')),
            h('div', { className: 'dsc-kaka-pills' },
              h('span', { className: 'dsc-kaka-pill is-brand' }, '「' + (data.quote || '') + '」'),
              h('span', { className: 'dsc-kaka-pill' }, t('about.tagWarm')),
              h('span', { className: 'dsc-kaka-pill' }, t('about.tagLoyal')),
              h('span', { className: 'dsc-kaka-pill' }, t('about.tagHonest'))))),
        h('div', { className: 'dsc-kaka-grid' }, cells.map(function (cell, index) {
          return h('div', { className: 'dsc-kaka-cell', key: 'c' + index },
            h('div', { className: 'dsc-kaka-cell-k' }, cell.k),
            h('div', { className: 'dsc-kaka-cell-v' }, cell.v),
            h('div', { className: 'dsc-kaka-cell-n' }, cell.n))
        })),
        h('div', { className: 'dsc-kaka-foot' },
          h('span', null, t('about.footerData')),
          h('span', null, t('about.footerShared')),
          h('span', null, t('about.footerKeep'))),
      )
    }

    /** 对话区里的「咔咔」页签：关于 / 日记 / 梦 / 记忆。 */
    function KakaView(props) {
      var t = props.t
      // 双保险：页签由守门组件按预设动态登记，这里再看一眼预设，免得回收延迟时露出空白页
      var preset = typeof props.useSessions === 'function' && props.sessionId
        ? props.useSessions(function (snapshot) {
          return snapshot && snapshot.byId && snapshot.byId[props.sessionId]
            ? (snapshot.byId[props.sessionId].projectionValues && snapshot.byId[props.sessionId].projectionValues.agentPreset)
            : undefined
        })
        : undefined
      // initialView 是渲染测试的注入口；真实运行全靠下面的 effect 拉取
      var seed = props.initialView || {}
      var [part, setPart] = useState(seed.part || 'about')
      var [meta, setMeta] = useState(seed.meta || null)
      var [about, setAbout] = useState(seed.about || null)
      var [day, setDay] = useState(seed.day || '')
      var [target, setTarget] = useState(seed.target || 'agent')
      var [text, setText] = useState(seed.text || '')
      var [loading, setLoading] = useState(false)
      var [error, setError] = useState('')

      useEffect(function () {
        kakaTabOpen = true
        return function () { kakaTabOpen = false }
      }, [])

      var loadMeta = useCallback(function () {
        getJson(API + '/view?part=meta')
          .then(function (payload) { if (payload && payload.ok) setMeta(payload) })
          .catch(function (err) { setError(String(err && err.message || err)) })
        getJson(API + '/about')
          .then(function (payload) { if (payload && payload.ok) setAbout(payload) })
          .catch(function (err) { setError(String(err && err.message || err)) })
      }, [])

      useEffect(function () { loadMeta() }, [loadMeta])

      useEffect(function () {
        if (part === 'about') return function () {}

        var cancelled = false
        setError('')

        if (part === 'memory') {
          setLoading(true)
          getJson(API + '/view?part=memory&target=' + encodeURIComponent(target))
            .then(function (payload) {
              if (cancelled) return
              setText(payload && payload.ok ? (payload.text || '') : '')
              if (!payload || !payload.ok) setError(String(payload && payload.error || 'load failed'))
            })
            .catch(function (err) { if (!cancelled) setError(String(err && err.message || err)) })
            .then(function () { if (!cancelled) setLoading(false) })
          return function () { cancelled = true }
        }

        var list = (part === 'diary' ? (meta && meta.days) : (meta && meta.dreams)) || []
        var selected = day && list.indexOf(day) >= 0 ? day : (list[0] || '')
        if (!selected) {
          setText('')
          return function () { cancelled = true }
        }
        if (selected !== day) setDay(selected)
        setLoading(true)
        getJson(API + '/view?part=' + part + '&date=' + encodeURIComponent(selected))
          .then(function (payload) {
            if (cancelled) return
            setText(payload && payload.ok ? (payload.text || '') : '')
            if (!payload || !payload.ok) setError(String(payload && payload.error || 'load failed'))
          })
          .catch(function (err) { if (!cancelled) setError(String(err && err.message || err)) })
          .then(function () { if (!cancelled) setLoading(false) })
        return function () { cancelled = true }
      }, [part, day, target, meta, t])

      var parts = [
        { value: 'about', label: t('about.tab') },
        { value: 'diary', label: t('view.diary') },
        { value: 'dream', label: t('view.dream') },
        { value: 'memory', label: t('view.memory') },
      ]

      var chips = null
      var countLabel = ''
      if (part === 'memory') {
        chips = [
          { value: 'agent', label: t('view.agent') },
          { value: 'user', label: t('view.user') },
        ].map(function (item) {
          return h('button', {
            key: item.value,
            type: 'button',
            className: 'dsc-kaka-chip' + (target === item.value ? ' is-active' : ''),
            onClick: function () { setTarget(item.value) },
          }, item.label)
        })
        if (meta && meta.memory) {
          countLabel = (target === 'user' ? meta.memory.user : meta.memory.agent) + ' ' + t('view.chars')
        }
      } else if (part !== 'about') {
        var days = ((part === 'diary' ? (meta && meta.days) : (meta && meta.dreams)) || []).slice(0, 8)
        chips = days.map(function (item) {
          return h('button', {
            key: item,
            type: 'button',
            className: 'dsc-kaka-chip' + (day === item ? ' is-active' : ''),
            onClick: function () { setDay(item) },
          }, item)
        })
      }

      var headerSub = about
        ? (about.species || '') + ' · ' + (about.role || '')
        : t('view.loading')

      var body
      if (part === 'about') {
        body = h(KakaAbout, { t: t, data: about })
      } else if (loading) {
        body = h('div', { className: 'dsc-kaka-skel' },
          h('i', { style: { width: '92%' } }),
          h('i', { style: { width: '86%' } }),
          h('i', { style: { width: '64%' } }),
          h('i', { style: { width: '78%' } }))
      } else if (!text) {
        body = h('div', { className: 'dsc-kaka-view-empty' },
          h('img', { src: ASSET, alt: '' }),
          h('div', null, t('view.empty')))
      } else if (part === 'memory') {
        var blocks = parseMemory(text)
        body = h('div', { className: 'dsc-kaka-prose' }, blocks.map(function (block, index) {
          var key = 'b' + index
          if (block.type === 'heading') return h('h3', { key }, block.text)
          if (block.type === 'list') {
            return h('ul', { key }, block.items.map(function (item, itemIndex) {
              return h('li', { key: key + '-' + itemIndex }, item)
            }))
          }
          return h('p', { key }, block.text)
        }))
      } else {
        var paragraphs = splitProse(text)
        body = h('div', { className: 'dsc-kaka-prose' }, paragraphs.map(function (paragraph, index) {
          return h('p', {
            key: 'p' + index,
            className: index === 0 ? 'dsc-kaka-lead' : undefined,
          }, paragraph)
        }))
      }

      if (preset !== undefined && preset !== PRESET_ID) return null

      var selectedDay = part === 'about' || part === 'memory'
        ? ''
        : (day || ((part === 'diary' ? (meta && meta.days) : (meta && meta.dreams)) || [])[0] || '')

      return h('div', { className: 'dsc-kaka-view' },
        h('style', null, VIEW_CSS),
        h('div', { className: 'dsc-kaka-view-head' },
          h('img', { className: 'dsc-kaka-view-avatar', src: ASSET, alt: '' }),
          h('div', { className: 'dsc-kaka-view-titles' },
            h('div', { className: 'dsc-kaka-view-title' }, t('view.title')),
            h('div', { className: 'dsc-kaka-view-sub' }, headerSub)),
          h('div', { className: 'dsc-kaka-view-tabs' }, parts.map(function (item) {
            return h('button', {
              key: item.value,
              type: 'button',
              className: 'dsc-kaka-tab' + (part === item.value ? ' is-active' : ''),
              onClick: function () { setPart(item.value); setDay('') },
            }, item.label)
          }))),
        chips && chips.length
          ? h('div', { className: 'dsc-kaka-view-chips' },
            chips,
            countLabel ? h('span', { className: 'dsc-kaka-view-count' }, countLabel) : null)
          : null,
        error
          ? h('div', { className: 'dsc-kaka-view-empty', style: { color: 'var(--dsw-alias-state-error-primary)' } }, error)
          : null,
        h('article', { className: 'dsc-kaka-paper' },
          selectedDay
            ? h('div', { className: 'dsc-kaka-paper-meta' },
              h('span', { className: 'dsc-kaka-paper-date' }, formatDayTitle(selectedDay)),
              h('span', { className: 'dsc-kaka-paper-week' }, weekdayOf(selectedDay)))
            : null,
          body),
      )
    }

    // ============================================================ 注册

    function apply(ctx) {
      var lang = detectLang(ctx)
      var t = makeT(lang)

      // 打开一个会话（设置页的「去她家看看」）。uiWorkspace 是官方 Client 服务，
      // 拿不到时按钮会降级为只显示会话 id，不报错。
      function openSessionById(sessionId) {
        try {
          var workspace = ctx.get('uiWorkspace')
          if (workspace && typeof workspace.openSession === 'function') {
            workspace.openSession(sessionId)
            return true
          }
        } catch (err) { /* 服务缺席 */ }
        return false
      }

      // 宠物：只在咔咔会话出现（判定在组件内部，非咔咔会话只留 0 尺寸锚点）
      ctx.slots.inject('conversation.input.overlay', function () {
        return ctx.slots.register({
          name: 'conversation.input.overlay',
          id: PLUGIN_ID + '-pet',
          order: 5,
          inject: function () { return { t: t } },
        }, function KakaPetSlot(props) { return h(PetBoundary, null, h(KakaPet, props)) })
      })

      // 对话页签：因为槽位没有"按会话条件注册"的选项，这里用一个小守门组件
      // 盯着"当前会话的预设"：是咔咔就登记这个视图，不是就注销。
      // 注销后页签本身会从对话头部消失，而不是留一个点进去空白的标签。
      function registerKakaView() {
        return ctx.slots.inject('conversation.view', function () {
          return ctx.slots.register({
            name: 'conversation.view',
            id: 'kaka',
            order: 5,
            label: function () { return t('view.title') },
            inject: function () { return { t: t } },
          }, function KakaViewSlot(props) { return h(PetBoundary, null, h(KakaView, props)) })
        })
      }

      kakaViewRegistrar = registerKakaView

      function KakaViewGate(props) {
        var useSessions = props.useSessions
        var current = typeof useSessions === 'function'
          ? useSessions(function (snapshot) { return snapshot && snapshot.current })
          : undefined
        var preset = typeof useSessions === 'function'
          ? useSessions(function (snapshot) {
            return current && snapshot && snapshot.byId && snapshot.byId[current]
              ? (snapshot.byId[current].projectionValues && snapshot.byId[current].projectionValues.agentPreset)
              : undefined
          })
          : undefined
        var disposeRef = useRef(null)

        useEffect(function () {
          var shouldShow = preset === PRESET_ID
          if (shouldShow && !disposeRef.current) {
            disposeRef.current = registerKakaView()
          } else if (!shouldShow && disposeRef.current) {
            try { disposeRef.current() } catch (err) { /* ignore */ }
            disposeRef.current = null
          }
          return undefined
        }, [preset])

        useEffect(function () {
          return function () {
            if (disposeRef.current) {
              try { disposeRef.current() } catch (err) { /* ignore */ }
              disposeRef.current = null
            }
          }
        }, [])

        return null
      }

      ctx.slots.inject('shell.overlay', function () {
        return ctx.slots.register({
          name: 'shell.overlay',
          id: PLUGIN_ID + '-view-gate',
          order: 5,
        }, function KakaViewGateSlot(props) { return h(PetBoundary, null, h(KakaViewGate, props)) })
      })

      // 设置页：放在「插件」设置里的一个 tab
      ctx.slots.inject('settings.plugins.tab', function () {
        return ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'kaka',
          order: 20,
          label: function () { return t('settings.title') },
          inject: function () { return { t: t, openSession: openSessionById } },
        }, function KakaSettingsSlot(props) { return h(PetBoundary, null, h(KakaSettings, props)) })
      })
    }

    exports.name = PLUGIN_ID
    exports.inject = ['slots']
    exports.apply = apply
    // 给渲染测试用的纯函数（不参与真实运行）
    exports.__test = {
      splitProse: splitProse,
      parseMemory: parseMemory,
      formatDayTitle: formatDayTitle,
      weekdayOf: weekdayOf,
      registerView: function () { return kakaViewRegistrar ? kakaViewRegistrar() : undefined },
    }
    return module.exports
  },
})
