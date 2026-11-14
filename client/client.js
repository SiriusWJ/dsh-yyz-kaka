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
        'view.memoryShort': '记忆',
        'view.portrait': '画像',
        'view.portraitEmpty': '她还没画过主人的样子',
        'view.portraitHint': '跟她说「画张我」，她就会用画笔把你留下来',
        'view.portraitNote': '她眼里的主人',
        'view.cloudHint': '出现越多，说明这件事她越在意',

        'about.tab': '关于',
        'dock.open': '咔咔的小本子',
        'dock.settings': '设置',
        'dock.about': '关于咔咔',
        'dock.memory': '记忆',
        'dock.plan': '事项',
        'panel.title': '咔咔的小本子',
        'panel.close': '关闭',
        'plan.kind.reminder': '闹钟',
        'plan.kind.wake': '醒来',
        'plan.kind.diary': '写日记',
        'plan.kind.dream': '做梦',
        'plan.kind.other': '其他',
        'plan.noWhat': '到点叫她',
        'plan.empty': '她还没有给自己排任何日程',
        'dream.action': '立刻做个梦',
        'dream.queued': '已经让她去睡了，醒来会在日记里告诉你',

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
        'about.lastDream': '上次整理',
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
        'view.memoryShort': 'Memory',
        'view.portrait': 'Portrait',
        'view.portraitEmpty': "She hasn't drawn you yet",
        'view.portraitHint': 'Ask her to "draw me" and she will keep you here',
        'view.portraitNote': 'How she sees you',
        'view.cloudHint': 'The bigger, the more she cares',

        'about.tab': 'About',
        'dock.open': "Kaka's notebook",
        'dock.settings': 'Settings',
        'dock.about': 'About her',
        'dock.memory': 'Memory',
        'dock.plan': 'Schedule',
        'panel.title': "Kaka's notebook",
        'panel.close': 'Close',
        'plan.kind.reminder': 'Alarm',
        'plan.kind.wake': 'Wake',
        'plan.kind.diary': 'Journal',
        'plan.kind.dream': 'Dream',
        'plan.kind.other': 'Other',
        'plan.noWhat': 'Wake her up',
        'plan.empty': 'She has no schedule yet',
        'dream.action': 'Dream now',
        'dream.queued': 'She went to sleep; the dream shows up tomorrow',

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
        'about.lastDream': 'Last tidy',
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
        // 归一化：/kaka/audio/<sha>.wav → /kaka/audio?id=<sha>（精确路由才拿得到）
        url = String(url).replace(/\/kaka\/audio\/([a-f0-9]{40})\.wav$/u, '/kaka/audio?id=$1')
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
          promise.catch(function (err) {
            self.playing = false
            try { console.warn('[kaka] 播放失败：', err && err.message, url) } catch (e2) { /* ignore */ }
          })
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
      drawing: 'dsc-kaka-drawbob 1.6s ease-in-out infinite',
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
      '@keyframes dsc-kaka-drawbob{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-2px) rotate(1.5deg)}}',
      '@keyframes dsc-kaka-pen{0%,100%{transform:rotate(-24deg) translate(0,0)}35%{transform:rotate(-15deg) translate(1.5px,-1.5px)}70%{transform:rotate(-31deg) translate(-1px,1px)}}',
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
      var sprite = h('img', {
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

      if (mood !== 'drawing') return sprite

      // 画画中：右钳握一支笔，笔尖轻轻画动
      var penSize = Math.round(size * 0.5)
      var pen = h('svg', {
        viewBox: '0 0 40 40',
        'aria-hidden': 'true',
        style: {
          position: 'absolute',
          right: -Math.round(size * 0.1) + 'px',
          bottom: -Math.round(size * 0.02) + 'px',
          width: penSize,
          height: penSize,
          transform: 'rotate(-24deg)',
          transformOrigin: '70% 90%',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.28))',
          animation: 'dsc-kaka-pen 1.1s ease-in-out infinite',
          pointerEvents: 'none',
        },
      },
        h('rect', { x: 17, y: 3, width: 7, height: 23, rx: 3.5, fill: '#d9482a', stroke: '#2e2a28', strokeWidth: 2.2 }),
        h('rect', { x: 17, y: 8, width: 7, height: 3, fill: '#f4f2ee', opacity: .9 }),
        h('path', { d: 'M17 26h7l-3.5 9z', fill: '#2e2a28' }),
        h('circle', { cx: 31, cy: 9, r: 2.2, fill: '#f4b400' }),
      )

      return h('div', {
        style: {
          position: 'relative',
          width: size,
          height: size,
          pointerEvents: 'none',
        },
      }, sprite, pen)
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
        this.error = error
        try { console.warn('[kaka] 渲染失败：', error) } catch (err) { /* ignore */ }
      }

      render() {
        if (!this.state.failed) return this.props.children || null
        // 不再静默变空白：把错误摊开，主人一眼就能看见是哪坏了
        var message = this.error && (this.error.message || String(this.error))
        return h('div', {
          style: {
            margin: '16px 4px',
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid var(--dsw-alias-state-error-primary, #c0392b)',
            background: 'var(--dsw-alias-bg-layer-2, transparent)',
            color: 'var(--dsw-alias-label-primary, inherit)',
            fontSize: 12,
            lineHeight: '18px',
          },
        },
        h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '咔咔这块没画出来'),
        h('div', { style: { opacity: .8, wordBreak: 'break-word' } }, message || '未知错误'),
        h('div', { style: { opacity: .65, marginTop: 6 } }, '刷新页面试试；还不行就把这段发给我'))
      }
    }

    /** 输入框旁的宠物。只在咔咔会话渲染；点击 = 摸她。 */
    function KakaPet(props) {
      var sessionId = props.sessionId
      var t = props.t

      // 预设判定：宿主官方 agent-preset 标签读的就是这个字段
      // 读会话快照要稳：宿主快照形状变了也不能把整块渲染带崩
      var preset
      if (typeof props.useSessions === 'function') {
        try {
          preset = props.useSessions(function (snapshot) {
            return sessionId && snapshot && snapshot.byId && snapshot.byId[sessionId]
              ? snapshot.byId[sessionId].projectionValues && snapshot.byId[sessionId].projectionValues.agentPreset
              : undefined
          })
        } catch (err) {
          preset = undefined
        }
      }
      var isKaka = preset === PRESET_ID

      var anchorRef = useRef(null)
      var [rect, setRect] = useState(null)
      var [mood, setMood] = useState(props.initialMood || 'idle')
      var [bubble, setBubble] = useState('')
      // initialSettings 只是给渲染测试用的注入口，真实运行时由 /kaka/profile 拉取
      var [settings, setSettings] = useState(props.initialSettings || null)
      var [busy, setBusy] = useState(false)
      var [hover, setHover] = useState(false)
      // 只有「对话」页签才显示宠物；切到咔咔/轨迹/上下文等页签时让位。
      var [viewId, setViewId] = useState(readViewId(sessionId))
      // 图标坞打开的那一页（null = 收起）；initialPanel 是渲染测试的注入口
      var [panel, setPanel] = useState(props.initialPanel || null)
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

      // 外部也可通过 window 事件打开面板（调试与联动用）
      useEffect(function () {
        function onOpen(event) {
          var part = event && event.detail && event.detail.part
          setPanel(part === null ? null : (part || 'about'))
        }
        window.addEventListener('kaka-panel', onOpen)
        return function () { window.removeEventListener('kaka-panel', onOpen) }
      }, [])

      // Esc 收起小本子
      useEffect(function () {
        if (!panel) return undefined
        function onKey(event) {
          if (event.key === 'Escape') setPanel(null)
        }
        document.addEventListener('keydown', onKey)
        return function () { document.removeEventListener('keydown', onKey) }
      }, [panel])

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

      var size = 80 // 设置里不再提供尺寸选项，固定 80px
      var style = { position: 'fixed', zIndex: 40, display: 'flex', alignItems: 'flex-end' }
      if (rect) {
        var left = Math.round(rect.left - size - 34)
        var top = Math.round(rect.top + rect.height / 2 - size * 0.86)
        if (left < 12) left = Math.round(rect.left + 6)
        if (top < 8) top = 8
        style.left = left + 'px'
        style.top = top + 'px'
      } else {
        style.left = '12px'
        style.bottom = '120px'
      }

      var bubbleKey = PET_BUBBLES[mood] ? t(PET_BUBBLES[mood]) : ''
      // 常驻心情文案只在悬停/聚焦时冒头；事件气泡（被摸、冒泡）照常显示
      var bubbleText = bubble || (hover ? bubbleKey : '')

      var dockNode = h('div', {
        className: 'dsc-kaka-dock-wrap',
        style: { position: 'absolute', left: 0, top: 'calc(100% + 6px)' },
      }, h('div', { className: 'dsc-kaka-dock' },
        DOCK_ITEMS.map(function (item) {
          return h('button', {
            key: item.part,
            type: 'button',
            className: 'dsc-kaka-ibtn' + (panel === item.part ? ' is-open' : ''),
            'aria-label': t(item.label),
            onClick: function () {
              setPanel(function (current) { return current === item.part ? null : item.part })
            },
          }, h(DockIcon, { name: item.icon }), h('span', { className: 'dsc-kaka-tip' }, t(item.label)))
        })))

      var panelNode = null
      if (panel) {
        var viewportWidth = (typeof window !== 'undefined' && window.innerWidth) || 1280
        var viewportHeight = (typeof window !== 'undefined' && window.innerHeight) || 800
        var petLeft = parseFloat(style.left) || 12
        var petTop = parseFloat(style.top)
        if (!Number.isFinite(petTop)) {
          var petBottom = parseFloat(style.bottom)
          petTop = Number.isFinite(petBottom) ? viewportHeight - petBottom - size : viewportHeight - 200
        }

        // 固定尺寸：桌面 420×560，窄屏（手机）铺满可用宽度并贴底
        var narrow = viewportWidth < 640
        var panelWidth = narrow ? Math.min(viewportWidth - 24, 460) : 420
        var panelHeight = narrow
          ? Math.min(viewportHeight - 96, 560)
          : Math.min(560, Math.max(320, petTop - 24))
        var panelLeft = narrow
          ? Math.round((viewportWidth - panelWidth) / 2)
          : Math.max(12, Math.min(petLeft, viewportWidth - panelWidth - 12))
        var panelStyle = {
          position: 'fixed',
          zIndex: 70,
          width: Math.round(panelWidth) + 'px',
          height: Math.round(panelHeight) + 'px',
          left: panelLeft + 'px',
          bottom: narrow ? '12px' : Math.round(Math.max(12, viewportHeight - (petTop - 12))) + 'px',
          pointerEvents: 'auto',
        }
        panelNode = createPortal(
          h(KakaPanel, {
            t: t,
            part: panel,
            style: panelStyle,
            onClose: function () { setPanel(null) },
          }),
          document.body,
        )
      }

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
      bubbleText && !panel
        ? h('div', {
          style: {
            position: 'absolute',
            left: 0,
            bottom: 'calc(100% + 8px)',
            transform: 'translateX(0)',
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
      ),
      dockNode,
      )

      return h(React.Fragment, null,
        h('span', { ref: anchorRef, style: { display: 'inline-block', width: 0, height: 0 } }),
        h('style', null, PET_CSS + PANEL_CSS + NOTEBOOK_CSS),
        createPortal(petNode, document.body),
        panelNode,
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
      // 开关：关闭态用灰轨道（原来的 state-idle-primary 在这套主题里接近白色，白钮看不见）
      '.dsc-kaka-switch{position:relative;flex-shrink:0;width:38px;height:22px;border-radius:999px;border:none;cursor:pointer;padding:0;background:color-mix(in srgb, var(--dsw-alias-label-secondary) 34%, transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-label-secondary) 28%, transparent);transition:background .16s, box-shadow .16s}',
      '.dsc-kaka-switch:hover{background:color-mix(in srgb, var(--dsw-alias-label-secondary) 46%, transparent)}',
      '.dsc-kaka-switch[data-on="true"]{background:var(--dsw-alias-brand-primary);box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary) 80%, #000 20%)}',
      '.dsc-kaka-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsc-kaka-thumb{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.06);transition:transform .16s cubic-bezier(.2,.8,.3,1)}',
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
            }))),

      )
    }

    // ============================================================ 咔咔的小本子（浮层面板）

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

    var PANEL_CSS = [
      /* ── 共用排版 ── */
      '.dsc-kaka-view-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px 0;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dsc-kaka-view-empty img{width:52px;height:52px;opacity:.42}',
      '.dsc-kaka-skel{display:flex;flex-direction:column;gap:11px;padding:8px 0}',
      '.dsc-kaka-skel i{display:block;height:10px;border-radius:5px;background:linear-gradient(90deg,var(--dsw-alias-bg-layer-2) 25%,var(--dsw-alias-border-l1) 50%,var(--dsw-alias-bg-layer-2) 75%);background-size:200% 100%;animation:dsc-kaka-shimmer 1.4s linear infinite}',
      '@keyframes dsc-kaka-shimmer{0%{background-position:180% 0}100%{background-position:-80% 0}}',
      '.dsc-kaka-view-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
      '.dsc-kaka-chip{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font-size:11.5px;padding:3px 10px;border-radius:999px;cursor:pointer;font-family:inherit;transition:color .14s,border-color .14s,background .14s}',
      '.dsc-kaka-chip:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.dsc-kaka-chip.is-active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);font-weight:600}',
      '.dsc-kaka-prose p{margin:0 0 .85em;font-size:12.8px;line-height:1.9;color:var(--dsw-alias-label-primary)}',
      '.dsc-kaka-prose p:last-child{margin-bottom:0}',
      '.dsc-kaka-prose p.dsc-kaka-lead::first-letter{font-size:1.45em;font-weight:600;color:var(--dsw-alias-brand-primary)}',
      '.dsc-kaka-prose h3{margin:14px 0 6px;font-size:11px;font-weight:700;letter-spacing:.10em;color:var(--dsw-alias-brand-primary);opacity:.9}',
      '.dsc-kaka-prose h3:first-child{margin-top:0}',
      '.dsc-kaka-prose ul{margin:0 0 .9em;padding-left:16px}',
      '.dsc-kaka-prose li{font-size:12.2px;line-height:1.75;margin:0 0 .3em;color:var(--dsw-alias-label-primary)}',
      '.dsc-kaka-hero{display:flex;align-items:center;gap:14px;padding-bottom:14px;border-bottom:1px dashed var(--dsw-alias-border-l1)}',
      '.dsc-kaka-halo{position:relative;width:76px;height:76px;flex-shrink:0;display:grid;place-items:center}',
      '.dsc-kaka-halo img{position:relative;width:68px;height:68px;filter:drop-shadow(0 5px 10px rgba(0,0,0,.22))}',
      '.dsc-kaka-halo::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 50% 55%, color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent), transparent 68%)}',
      '.dsc-kaka-names{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.dsc-kaka-name{font-size:18px;font-weight:700;color:var(--dsw-alias-label-primary)}',
      '.dsc-kaka-role{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-pills{display:flex;gap:5px;flex-wrap:wrap;margin-top:2px}',
      '.dsc-kaka-pill{font-size:10px;padding:2px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-pill.is-brand{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)}',
      '.dsc-kaka-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}',
      '.dsc-kaka-cell{padding:8px 10px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}',
      '.dsc-kaka-cell-k{font-size:9.5px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-cell-v{font-size:13.5px;font-weight:650;margin-top:3px;white-space:nowrap;color:var(--dsw-alias-label-primary)}',

      /* ── 面板：固定尺寸，不随内容伸缩 ── */
      '.dsc-kaka-panel{position:fixed;z-index:70;display:flex;flex-direction:column;overflow:hidden;border-radius:18px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 28px 70px rgba(0,0,0,.34),0 2px 0 rgba(255,255,255,.04) inset;animation:dsc-kaka-panel-in .2s cubic-bezier(.2,.9,.3,1)}',
      '@keyframes dsc-kaka-panel-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '.dsc-kaka-panel-head{display:flex;align-items:center;gap:10px;padding:13px 14px 10px;background:linear-gradient(180deg,var(--dsw-alias-bg-layer-2),transparent)}',
      '.dsc-kaka-panel-avatar{width:30px;height:30px;flex-shrink:0;filter:drop-shadow(0 2px 5px rgba(0,0,0,.2))}',
      '.dsc-kaka-panel-titles{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.dsc-kaka-panel-title{font-size:13px;font-weight:650;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.dsc-kaka-panel-sub{font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px}',
      '.dsc-kaka-panel-close{margin-left:auto;width:24px;height:24px;display:grid;place-items:center;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-family:inherit;transition:background .14s,color .14s}',
      '.dsc-kaka-panel-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsc-kaka-panel-tabs{display:flex;gap:2px;padding:2px;margin:0 14px 8px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}',
      '.dsc-kaka-ptab{flex:1;border:none;background:transparent;padding:5px 6px;border-radius:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;font-family:inherit;white-space:nowrap;transition:background .14s,color .14s}',
      '.dsc-kaka-ptab.is-active{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.10)}',
      '.dsc-kaka-panel-body{flex:1;min-height:0;overflow:auto;padding:2px 14px 14px;overscroll-behavior:contain}',
      '.dsc-kaka-panel-foot{display:flex;align-items:center;gap:8px;padding:7px 14px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-panel-foot b{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dsc-kaka-panel-meta{display:flex;align-items:baseline;gap:8px;margin:0 0 10px;padding-bottom:8px;border-bottom:1px dashed var(--dsw-alias-border-l1)}',
      '.dsc-kaka-panel-meta b{font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary)}',
      '.dsc-kaka-panel-meta span{font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-plan-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px dashed var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-primary)}',
      '.dsc-kaka-plan-row:last-child{border-bottom:none}',
      '.dsc-kaka-plan-row .when{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap}',
      '.dsc-kaka-badge{font-size:10px;padding:2px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dsc-kaka-panel-action{display:inline-flex;align-items:center;gap:6px;margin-top:12px;padding:5px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:11.5px;cursor:pointer;font-family:inherit;transition:border-color .14s,color .14s}',
      '.dsc-kaka-panel-action:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',

      /* ── 单个入口按钮 ── */
      '.dsc-kaka-ibtn{position:relative;width:30px;height:30px;display:grid;place-items:center;border-radius:50%;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;pointer-events:auto;transition:transform .16s cubic-bezier(.2,.8,.3,1),color .16s,border-color .16s,box-shadow .16s;box-shadow:0 2px 6px rgba(0,0,0,.10)}',
      '.dsc-kaka-ibtn:hover,.dsc-kaka-ibtn:focus-visible{transform:translateY(-2px) scale(1.12);color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);box-shadow:0 6px 14px rgba(0,0,0,.18);outline:none;z-index:6}',
      '.dsc-kaka-ibtn.is-open{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dsc-kaka-ibtn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}',
      '.dsc-kaka-tip{position:absolute;z-index:5;left:calc(100% + 8px);top:50%;transform:translateY(-50%) translateX(-4px);white-space:nowrap;font-size:11.5px;padding:3px 8px;border-radius:7px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 6px 18px rgba(0,0,0,.18);opacity:0;pointer-events:none;transition:opacity .14s ease,transform .14s ease}',
      '.dsc-kaka-ibtn:hover .dsc-kaka-tip,.dsc-kaka-ibtn:focus-visible .dsc-kaka-tip{opacity:1;transform:translateY(-50%) translateX(0)}',
      '.dsc-kaka-dock{display:flex;flex-direction:row;gap:6px;pointer-events:auto;opacity:.62;transition:opacity .2s ease, transform .2s ease;transform:translateY(-2px)}',
      '.dsc-kaka-dock:hover,.dsc-kaka-dock:focus-within{opacity:1;transform:translateY(0)}',
      '.dsc-kaka-dock-wrap{display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}',
    ].join('')

    var DOCK_ITEMS = [
      { part: 'about', label: 'dock.open', icon: 'book' },
    ]

    var DOCK_ICONS = {
      info: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 11v5M12 8h.01' }]],
      book: [['path', { d: 'M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z' }], ['path', { d: 'M5 4v16M9 8h6M9 12h6' }]],
      chip: [['rect', { x: 7, y: 7, width: 10, height: 10, rx: 2 }], ['path', { d: 'M10 3v3M14 3v3M10 18v3M14 18v3M3 10h3M3 14h3M18 10h3M18 14h3' }]],
      moon: [['path', { d: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z' }]],
      check: [['path', { d: 'M4 7l2 2 3-3M4 15l2 2 3-3M12 8h8M12 16h8' }]],
    }

    /* ── 日记本 ── */
    var NOTEBOOK_CSS = [
      '.dsc-kaka-note{position:relative;border-radius:12px;padding:12px 14px 14px 32px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
      '.dsc-kaka-note::before{content:"";position:absolute;left:24px;top:8px;bottom:8px;width:1px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent)}',
      '.dsc-kaka-note::after{content:"";position:absolute;inset:0;border-radius:12px;pointer-events:none;background:repeating-linear-gradient(to bottom, transparent 0 25px, color-mix(in srgb, var(--dsw-alias-border-l1) 70%, transparent) 25px 26px);opacity:.55}',
      '.dsc-kaka-note-date{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}',
      '.dsc-kaka-note-date b{font-size:15px;font-weight:650;color:var(--dsw-alias-label-primary);font-family:"KaiTi","STKaiti","楷体",serif}',
      '.dsc-kaka-note-date span{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-note p{position:relative;z-index:1;margin:0 0 2px;font-family:"KaiTi","STKaiti","楷体",serif;font-size:14px;line-height:26px;color:var(--dsw-alias-label-primary);text-indent:2em}',
      '.dsc-kaka-note p:first-letter{color:var(--dsw-alias-brand-primary)}',
      '.dsc-kaka-note-art{position:relative;z-index:1;margin:10px 0 4px;display:flex;gap:8px;flex-wrap:wrap}',
      '.dsc-kaka-note-art figure{margin:0;display:flex;flex-direction:column;gap:4px}',
      '.dsc-kaka-note-art img{width:104px;height:78px;object-fit:contain;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',
      '.dsc-kaka-note-art figcaption{font-size:10px;color:var(--dsw-alias-label-secondary);text-align:center}',
      /* ── 记忆云 ── */
      '.dsc-kaka-cloud{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;padding:10px 2px 12px;border-bottom:1px dashed var(--dsw-alias-border-l1);margin-bottom:10px}',
      '.dsc-kaka-cloud i{display:inline-block;font-style:normal;padding:3px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);animation:dsc-kaka-float 7s ease-in-out infinite}',
      '.dsc-kaka-cloud i.is-hot{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)}',
      '@keyframes dsc-kaka-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}',
      /* ── 画像 ── */
      '.dsc-kaka-portrait{display:flex;flex-direction:column;align-items:center;gap:8px;padding:6px 0 2px}',
      '.dsc-kaka-portrait img{width:100%;max-width:250px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);box-shadow:0 8px 22px rgba(0,0,0,.14)}',
      '.dsc-kaka-portrait figcaption{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsc-kaka-portrait-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:22px 0;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}',
      '.dsc-kaka-portrait-empty img{width:56px;height:56px;opacity:.4}',
    ].join('')

    /** 从记忆正文里抽 `[标签]` 做成记忆云。 */
    function parseMemoryTags(text) {
      var counts = new Map()
      for (var raw of String(text || '').split('\n')) {
        var match = /^\s*[-*]\s*\[([^\]]{1,20})\]/u.exec(raw)
        if (!match) continue
        var tag = match[1].trim()
        counts.set(tag, (counts.get(tag) || 0) + 1)
      }
      return Array.from(counts.entries())
        .map(function (entry) { return { tag: entry[0], count: entry[1] } })
        .sort(function (a, b) { return b.count - a.count })
        .slice(0, 24)
    }

    var WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

    var MOOD_KEYS = {
      idle: 'mood.idle', focus: 'mood.focus', proud: 'mood.proud', worried: 'mood.worried',
      tired: 'mood.tired', dreaming: 'mood.dreaming', petted: 'mood.petted', sleeping: 'mood.sleeping',
    }

    var PHASE_KEYS = {
      awake: 'phase.awake', quiet: 'phase.quiet', diary: 'phase.diary',
      dreaming: 'phase.dreaming', sleeping: 'phase.sleeping',
    }

    var EVENT_KEYS = {
      reminder: 'plan.kind.reminder', wake: 'plan.kind.wake',
      diary: 'plan.kind.diary', dream: 'plan.kind.dream',
    }

    /** 渲染一个图标（内联 SVG，跟随 currentColor）。 */
    function DockIcon(props) {
      var shape = DOCK_ICONS[props.name] || DOCK_ICONS.info
      return h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, shape.map(function (entry, index) {
        return h(entry[0], Object.assign({ key: 'i' + index }, entry[1]))
      }))
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

    /** 时间戳 → 'HH:mm'。 */
    function formatClock(stamp) {
      var date = new Date(Number(stamp) || Date.now())
      return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
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
        return h('div', { className: 'dsc-kaka-skel' }, h('i', { style: { width: '70%' } }), h('i', { style: { width: '92%' } }))
      }
      var stats = data.stats || {}
      var birthday = Number(data.birthday) || Date.now()
      var days = Math.max(1, Math.floor((Date.now() - birthday) / 86400000) + 1)
      var moodLabel = t(MOOD_KEYS[data.mood] || 'mood.idle')
      var phaseLabel = t(PHASE_KEYS[data.phase] || 'phase.awake')
      var cells = [
        { k: t('about.companion'), v: formatDuration(data.companionMs, t) },
        { k: t('about.birthday'), v: formatBirthday(birthday) },
        { k: t('about.turns'), v: String(stats.turns || 0) },
        { k: t('about.memory'), v: (stats.memoryChars || 0) + ' ' + t('view.chars') },
        { k: t('about.diary'), v: (stats.diaryDays || 0) + ' ' + t('about.days') },
        { k: t('about.lastDream'), v: data.lastDreamDate ? formatDayTitle(data.lastDreamDate) : '—' },
        { k: t('about.voice'), v: '¥' + (stats.yuan || 0) },
        { k: t('about.mood'), v: moodLabel + ' · ' + phaseLabel },
      ]
      return h(React.Fragment, null,
        h('div', { className: 'dsc-kaka-hero' },
          h('div', { className: 'dsc-kaka-halo' }, h('img', { src: ASSET, alt: '' })),
          h('div', { className: 'dsc-kaka-names' },
            h('div', { className: 'dsc-kaka-name' }, data.name || t('view.title')),
            h('div', { className: 'dsc-kaka-role' }, (data.species || '') + ' · ' + (data.role || '')),
            h('div', { className: 'dsc-kaka-pills' },
              h('span', { className: 'dsc-kaka-pill is-brand' }, '「' + (data.quote || '') + '」'),
              h('span', { className: 'dsc-kaka-pill' }, t('about.tagWarm')),
              h('span', { className: 'dsc-kaka-pill' }, t('about.tagLoyal')),
              h('span', { className: 'dsc-kaka-pill' }, t('about.tagHonest'))))),
        h('div', { className: 'dsc-kaka-grid' }, cells.map(function (cell, index) {
          return h('div', { className: 'dsc-kaka-cell', key: 'c' + index },
            h('div', { className: 'dsc-kaka-cell-k' }, cell.k),
            h('div', { className: 'dsc-kaka-cell-v' }, cell.v))
        })),
      )
    }

    /**
     * 咔咔的小本子（浮层）。图标坞一个入口，内部三页：
     * 关于 / 事项 / 记忆（记忆里再分 日记 / 记忆 / 画像）。
     */
    function KakaPanel(props) {
      var t = props.t
      var initialPart = props.part || 'about'
      var [section, setSection] = useState(['plan', 'memory', 'settings'].includes(initialPart) ? initialPart : 'about')
      var [tab, setTab] = useState('diary')
      var [meta, setMeta] = useState(null)
      var [about, setAbout] = useState(null)
      var [day, setDay] = useState('')
      var [text, setText] = useState('')
      var [dayArt, setDayArt] = useState([])
      var [art, setArt] = useState({ items: [], portrait: null })
      var [plan, setPlan] = useState([])
      var [loading, setLoading] = useState(false)
      var [note, setNote] = useState('')
      var [error, setError] = useState('')

      useEffect(function () {
        var next = ['plan', 'memory', 'settings'].includes(initialPart) ? initialPart : 'about'
        setSection(next)
      }, [initialPart])

      useEffect(function () {
        getJson(API + '/view?part=meta')
          .then(function (payload) { if (payload && payload.ok) setMeta(payload) })
          .catch(function (err) { setError(String(err && err.message || err)) })
        getJson(API + '/about')
          .then(function (payload) { if (payload && payload.ok) setAbout(payload) })
          .catch(function (err) { setError(String(err && err.message || err)) })
        getJson(API + '/art/list')
          .then(function (payload) {
            if (payload && payload.ok) setArt({ items: payload.items || [], portrait: payload.portrait || null })
          })
          .catch(function () { /* 画册拉不到不影响其它页 */ })
      }, [])

      useEffect(function () {
        if (section !== 'plan') return function () {}
        var cancelled = false
        getJson(API + '/life/state')
          .then(function (payload) { if (!cancelled && payload && payload.ok) setPlan(payload.events || []) })
          .catch(function (err) { if (!cancelled) setError(String(err && err.message || err)) })
        return function () { cancelled = true }
      }, [section])

      useEffect(function () {
        if (section !== 'memory') return function () {}
        var cancelled = false
        setError('')

        if (tab === 'agent' || tab === 'user') {
          if (tab === 'user') {
            // 画像页只看画，不用拉记忆正文
            setText('')
            setLoading(false)
            return function () { cancelled = true }
          }
          setLoading(true)
          getJson(API + '/view?part=memory&target=' + tab)
            .then(function (payload) {
              if (cancelled) return
              setText(payload && payload.ok ? (payload.text || '') : '')
              if (!payload || !payload.ok) setError(String(payload && payload.error || 'load failed'))
            })
            .catch(function (err) { if (!cancelled) setError(String(err && err.message || err)) })
            .then(function () { if (!cancelled) setLoading(false) })
          return function () { cancelled = true }
        }

        var list = (tab === 'diary' ? (meta && meta.days) : []) || []
        var selected = day && list.indexOf(day) >= 0 ? day : (list[0] || '')
        if (!selected) {
          setText('')
          setDayArt([])
          return function () { cancelled = true }
        }
        if (selected !== day) setDay(selected)
        setLoading(true)
        getJson(API + '/view?part=diary&date=' + encodeURIComponent(selected))
          .then(function (payload) {
            if (cancelled) return
            setText(payload && payload.ok ? (payload.text || '') : '')
            setDayArt(payload && Array.isArray(payload.art) ? payload.art : [])
            if (!payload || !payload.ok) setError(String(payload && payload.error || 'load failed'))
          })
          .catch(function (err) { if (!cancelled) setError(String(err && err.message || err)) })
          .then(function () { if (!cancelled) setLoading(false) })
        return function () { cancelled = true }
      }, [section, tab, day, meta, t])

      var sectionTitles = {
        about: t('dock.about'),
        plan: t('dock.plan'),
        memory: t('dock.memory'),
        settings: t('dock.settings'),
      }

      var tabs = [
        { value: 'diary', label: t('view.diary') },
        { value: 'agent', label: t('view.memoryShort') },
        { value: 'user', label: t('view.portrait') },
      ]

      var chips = null
      if (section === 'memory') {
        var tabChips = h('div', { className: 'dsc-kaka-view-chips', style: { marginBottom: 8 } },
          tabs.map(function (item) {
            return h('button', {
              key: item.value,
              type: 'button',
              className: 'dsc-kaka-chip' + (tab === item.value ? ' is-active' : ''),
              onClick: function () { setTab(item.value); setDay('') },
            }, item.label)
          }))

        var dayChips = null
        if (tab === 'diary') {
          var days = ((meta && meta.days) || []).slice(0, 8)
          dayChips = days.length
            ? h('div', { className: 'dsc-kaka-view-chips', style: { marginBottom: 10 } },
              days.map(function (item) {
                return h('button', {
                  key: item,
                  type: 'button',
                  className: 'dsc-kaka-chip' + (day === item ? ' is-active' : ''),
                  onClick: function () { setDay(item) },
                }, item)
              }))
            : null
        }
        chips = h(React.Fragment, null, tabChips, dayChips)
      }

      var body
      if (section === 'settings') {
        body = h(KakaSettings, { t: t, openSession: props.openSession, compact: true })
      } else if (section === 'about') {
        body = h(KakaAbout, { t: t, data: about })
      } else if (section === 'plan') {
        body = plan.length
          ? h('div', null, plan
            .slice()
            .sort(function (a, b) { return a.dueAt - b.dueAt })
            .map(function (event) {
              return h('div', { className: 'dsc-kaka-plan-row', key: event.id },
                h('span', { className: 'dsc-kaka-badge' }, t(EVENT_KEYS[event.kind] || 'plan.kind.other')),
                h('span', null, event.what || t('plan.noWhat')),
                h('span', { className: 'when' }, formatClock(event.dueAt)))
            }))
          : h('div', { className: 'dsc-kaka-view-empty' },
            h('img', { src: ASSET, alt: '' }),
            h('div', null, t('plan.empty')))
      } else if (tab === 'user') {
        // 画像页只放主人的形象；别的画作属于「日记」和聊天，不在这里堆成画板
        body = art.portrait
          ? h('figure', { className: 'dsc-kaka-portrait' },
            h('img', { src: art.portrait.url, alt: art.portrait.title }),
            h('figcaption', null, '「' + art.portrait.title + '」 · ' + formatDayTitle(art.portrait.date)),
            h('figcaption', { style: { opacity: .7 } }, t('view.portraitNote')))
          : h('div', { className: 'dsc-kaka-portrait-empty' },
            h('img', { src: ASSET, alt: '' }),
            h('div', null, t('view.portraitEmpty')),
            h('div', { style: { opacity: .75 } }, t('view.portraitHint')))
      } else if (loading) {
        body = h('div', { className: 'dsc-kaka-skel' },
          h('i', { style: { width: '92%' } }), h('i', { style: { width: '78%' } }), h('i', { style: { width: '64%' } }))
      } else if (!text) {
        body = h('div', { className: 'dsc-kaka-view-empty' },
          h('img', { src: ASSET, alt: '' }),
          h('div', null, t('view.empty')))
      } else if (tab === 'agent') {
        var tags = parseMemoryTags(text)
        body = h('div', null,
          tags.length
            ? h('div', { className: 'dsc-kaka-cloud' }, tags.map(function (item, index) {
              var size = Math.min(15.5, 11.5 + item.count * 1.1)
              return h('i', {
                key: item.tag,
                className: item.count > 1 ? 'is-hot' : undefined,
                style: { fontSize: size + 'px', animationDelay: (index * 0.35) + 's' },
                title: t('view.cloudHint'),
              }, item.tag)
            }))
            : null,
          h('div', { className: 'dsc-kaka-prose' }, parseMemory(text).map(function (block, index) {
            var key = 'b' + index
            if (block.type === 'heading') return h('h3', { key }, block.text)
            if (block.type === 'list') {
              return h('ul', { key }, block.items.map(function (item, itemIndex) {
                return h('li', { key: key + '-' + itemIndex }, item)
              }))
            }
            return h('p', { key }, block.text)
          })))
      } else {
        var selectedDay = day || ((meta && meta.days) || [])[0] || ''
        body = h('div', { className: 'dsc-kaka-note' },
          h('div', { className: 'dsc-kaka-note-date' },
            h('b', null, formatDayTitle(selectedDay)),
            h('span', null, weekdayOf(selectedDay))),
          splitProse(text).map(function (paragraph, index) {
            return h('p', { key: 'p' + index }, paragraph)
          }),
          dayArt.length
            ? h('div', { className: 'dsc-kaka-note-art' }, dayArt.map(function (item) {
              return h('figure', { key: item.id },
                h('img', { src: item.url, alt: item.title }),
                h('figcaption', null, item.title))
            }))
            : null)
      }

      return h('div', { className: 'dsc-kaka-panel', 'data-kaka-panel': 'true', style: props.style },
        h('div', { className: 'dsc-kaka-panel-head' },
          h('img', { className: 'dsc-kaka-panel-avatar', src: ASSET, alt: '' }),
          h('div', { className: 'dsc-kaka-panel-titles' },
            h('div', { className: 'dsc-kaka-panel-title' }, sectionTitles[section] || t('panel.title')),
            h('div', { className: 'dsc-kaka-panel-sub' },
              about ? (about.species || '') + ' · ' + formatDuration(about.companionMs, t) : t('view.loading'))),
          h('button', {
            type: 'button',
            className: 'dsc-kaka-panel-close',
            'aria-label': t('panel.close'),
            onClick: function () { if (props.onClose) props.onClose() },
          }, '✕')),
        h('div', { className: 'dsc-kaka-panel-tabs' }, [
          { value: 'about', label: t('dock.about') },
          { value: 'plan', label: t('dock.plan') },
          { value: 'memory', label: t('dock.memory') },
          { value: 'settings', label: t('dock.settings') },
        ].map(function (item) {
          return h('button', {
            key: item.value,
            type: 'button',
            className: 'dsc-kaka-ptab' + (section === item.value ? ' is-active' : ''),
            onClick: function () { setSection(item.value); setNote('') },
          }, item.label)
        })),
        h('div', { className: 'dsc-kaka-panel-body' },
          chips,
          error ? h('div', { className: 'dsc-kaka-view-empty', style: { color: 'var(--dsw-alias-state-error-primary)' } }, error) : null,
          body,
          note ? h('div', { className: 'dsc-kaka-panel-sub', style: { marginTop: 10 } }, note) : null),
        h('div', { className: 'dsc-kaka-panel-foot' },
          h('span', null, t('about.footerData')),
          h('span', { style: { marginLeft: 'auto' } }, t('about.footerKeep'))),
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
          inject: function () { return { t: t, openSession: openSessionById } },
        }, function KakaPetSlot(props) { return h(PetBoundary, null, h(KakaPet, props)) })
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

    // 控制台兜底入口：__DSH_KAKA__.open('about' | 'plan' | 'memory') / close()
    try {
      window.__DSH_KAKA__ = {
        open: function (part) {
          window.dispatchEvent(new CustomEvent('kaka-panel', { detail: { part: part || 'about' } }))
        },
        close: function () {
          window.dispatchEvent(new CustomEvent('kaka-panel', { detail: { part: null } }))
        },
      }
    } catch (err) { /* ignore */ }

    exports.name = PLUGIN_ID
    exports.inject = ['slots']
    exports.apply = apply
    // 给渲染测试用的纯函数（不参与真实运行）
    exports.__test = {
      KakaAbout: KakaAbout,
      KakaPanel: KakaPanel,
      splitProse: splitProse,
      parseMemoryTags: parseMemoryTags,
      parseMemory: parseMemory,
      formatDayTitle: formatDayTitle,
      weekdayOf: weekdayOf,
    }
    return module.exports
  },
})
