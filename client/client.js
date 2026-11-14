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
      var [settings, setSettings] = useState(null)
      var [busy, setBusy] = useState(false)
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

      if (!isKaka) {
        // 非咔咔会话：只留一个 0 尺寸锚点，不渲染任何视觉
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
        onKeyDown: function (event) {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPoke() }
        },
        style: {
          width: size,
          height: size,
          cursor: 'pointer',
          position: 'relative',
          pointerEvents: 'auto',
          transition: 'transform .18s ease',
          filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.22))',
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
      var [settings, setSettings] = useState(null)
      var [meta, setMeta] = useState(null)
      var [savedAt, setSavedAt] = useState(0)
      var [error, setError] = useState('')
      var [confirm, setConfirm] = useState('')
      var saveTimer = useRef(null)

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
          h(Row, { label: t('action.forceDream') },
            h('button', {
              type: 'button', className: 'dsc-kaka-btn',
              onClick: function () { postJson(API + '/life/force', { kind: 'dream' }).catch(function () {}) },
            }, t('action.forceDream')),
            h('button', {
              type: 'button', className: 'dsc-kaka-btn',
              onClick: function () { postJson(API + '/life/force', { kind: 'ramble' }).catch(function () {}) },
            }, t('action.ramble'))),
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
        }, KakaPet)
      })

      // 设置页：独立的「咔咔」栏
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register({
          name: 'settings.section',
          id: 'kaka',
          order: 25,
          label: function () { return t('settings.title') },
          inject: function () { return { t: t, openSession: openSessionById } },
        }, KakaSettings)
      })
    }

    exports.name = PLUGIN_ID
    exports.inject = ['slots']
    exports.apply = apply
    return module.exports
  },
})
