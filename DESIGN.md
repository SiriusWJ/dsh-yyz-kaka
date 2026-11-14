# 咔咔（Kaka）· DeepSeek Harness 插件设计方案

> 状态：设计定稿（待主人复核）
> 日期：2026-11-14
> 目标 DSH 版本：`0.2.2-rc.3`（Desktop profile）
> 设计输入：`D:\Code\AgentHubSolution` 中「咔咔」的人格资产（SOUL.md / IDENTITY.md / AGENT.md / icon_crab.png）

---

## 0. 一句话定位

把 AgentHub 里那只挥着大钳子的小螃蟹「咔咔」，做成 DeepSeek Harness 的一个**独立预设**：有人格、有跨会话共享的记忆、有嗓子、有自己的作息，且只有选中这个预设的会话才拥有她。

---

## 1. 事实核查（决定架构的硬约束）

以下均在当前安装的 DSH 中核对过，是方案的依据，不是推测。

| # | 事实 | 出处 | 对方案的影响 |
|---|---|---|---|
| F1 | Web 面把 host 层 `agent-instructions` 显式禁用（`disabled: true`），改为**每个预设自己挂** | `dsh-web-app/cordis.patch.yml:604` | 咔咔预设不挂这一行 = `~/.dsh/AGENTS.md` 与项目 AGENTS.md 都进不来，人设零污染，且**不需要改主人的全局文件** |
| F2 | 预设声明只有 `id / name / description / order`，**没有 icon 字段** | `dsh-agent-preset-registry/src/display.ts` | 预设选择器里只能靠名字+描述体现咔咔，头像属于插件页 |
| F3 | 插件图标允许 SVG / PNG / JPEG / WebP，**≤ 256 KiB** | `references/host-plugin.md:52` | 现有 `icon_crab.png`（200×200、32bpp ARGB、透明底、15.8 KB）可直接当 `./icon` |
| F4 | `@deepseek-ai/dsh-persona` 的 `config.prefix` 会**遮蔽**部署级 persona | `dsh-persona/README.md` | 咔咔人格写进 prefix 即可取代 "You are a coding agent…" |
| F5 | `sessionController.prompt({sessionId, mode:'queue'\|'steer', content})` 可向会话投递用户消息，`queue` 不打断 | Host `Service` 目录（sessionController） | 「点螃蟹 → 给咔咔发一句话」走官方通路，非 hack |
| F6 | `SessionState` = `{active, running, queue, pendingInput}` | 同上 | 可判断她忙不忙，避免排一堆"主人戳你" |
| F7 | `conversation.input.left` 的契约明写：固定定位覆盖层必须 portal 到 body，否则会被 docked composer 裁剪 | `client-ui-conversation/src/client/contract/input.ts` | 「输入框旁的宠物」必须用"slot 锚点 + portal 渲染"，不能直接塞进工具行 |
| F8 | 同 slot 提供 `InputActions.setDraft() / submit()` | 同上 | 说话入口可提示咔咔调工具 |
| F9 | `settings.section` 是根作用域列表槽，已有 account(-10)/general(0)/models(10)/plugins(15)/agent-presets(20)/cost-meter(30)/agent-instructions-editor(42) | Client `Slots` 检查 | 咔咔注册独立设置栏，order 取 25 |
| F10 | `agentPresets.presetForSession(session): string \| null` | Host `Service` 目录 | 客户端问"这是不是咔咔会话"的权威来源 |
| F11 | DeepSeek TTS：`POST https://api.deepseek.com/v1/tools/tts`，body `{text, voice_id: stella\|tide, format: wav\|pcm, filter_markdown}`，普通 API Key，流式返回；单次 ≤10,000 计费字符 / 64 KiB；汉字计 2 字符；1.5 元/万字符（限时 5 折） | 官方 API 文档与语音合成指南 | 语音能力可行；**没有语速/音高参数**，面板不能做假开关 |
| F12 | `dsh-notify-sound-plus` 已验证"宿主定状态 + 浏览器轮询 + 播放"的整条链路 | 该插件 `CONTRACT.md` | 语音发件箱与宠物状态沿用同一模式，不新造推送通道 |

未验证、需实现时确认：

- `PromptContentPart` 的确切形状（应为文本块；投递前需核对 `dsh-api-session-controller` 类型）。
- "单次请求 30 分钟音频上限"来自第三方报道，官方文档页未写明，按不确定对待。

---

## 2. 总体架构

一个包、三个面。**预设面**决定"咔咔是谁"，**宿主面**决定"她怎么活着"，**浏览器面**决定"她长什么样"。

```
┌─────────────────── 宿主面  lib/index.js ────────────────────┐
│  记忆仓库      MEMORY.md / USER.md / diary / dreams / audio   │
│  生命线程      5s tick + 事件表(diary/dream/reminder/wake/     │
│               quiet/ramble) + state.json 持久化               │
│  会话管家      「咔咔的家」创建 / 复用 / 失效重建               │
│  语音代理      DeepSeek TTS + sha1 缓存 + 计费记账             │
│  路由          /kaka/profile  /kaka/voice/*  /kaka/poke        │
│               /kaka/life/state  /kaka/tts  /kaka/settings      │
└───────────────────────────┬──────────────────────────────────┘
                            │ 预设作用域（仅咔咔会话）
┌───────────────────────────┴──────────────────────────────────┐
│  persona            咔咔人格全文（不含 AGENTS.md）             │
│  kaka-memory.mjs    记忆注入（SHA-1 去重）+ kaka_memory        │
│  kaka-voice.mjs     kaka_say / kaka_beep / kaka_mood /         │
│                     kaka_remind / kaka_diary                  │
│  工具               standard 预设全套                          │
└───────────────────────────┬──────────────────────────────────┘
                            │ 浏览器面  client/client.js
┌───────────────────────────┴──────────────────────────────────┐
│  宠物        80–96px，输入框左侧浮层（锚点 + portal），点击=摸   │
│  动画        心情状态机 + 💤 做梦态 + 冒泡气泡                  │
│  设置        「咔咔」独立设置栏（宠物 / 语音 / 提示 / 生命）     │
└───────────────────────────────────────────────────────────────┘
```

**为什么生命线程必须在宿主面**：做梦与写日记要在"主人今晚没开对话"时发生。预设面只在选中咔咔的会话里挂载，无会话即不存在；宿主面随插件常驻。

**"这是咔咔会话吗"的判定**：宿主侧 `ctx.agentPresets.presetForSession(session)`（F10），客户端通过 `/kaka/profile?session=` 询问，非咔咔会话连宠物锚点都不注册。

---

## 3. 工作区结构（计划）

```
D:\Code\dsh-yyz-kaka\
├── package.json            # dsh.bundle.patch + dsh.client
├── cordis.patch.yml        # 插入宿主行 + preset-kaka 声明
├── lib/
│   ├── index.js            # 宿主面入口（记忆仓库 / 生命线程 / 路由 / TTS）
│   ├── life.js             # 生命线程：tick、事件表、状态机
│   ├── memory.js           # 记忆文件读写、原子写、串行队列
│   ├── voice.js            # TTS 调用、缓存、计费
│   └── home-session.js     # 「咔咔的家」会话管理
├── preset/
│   ├── kaka-memory.mjs     # 记忆注入 + kaka_memory
│   └── kaka-voice.mjs      # kaka_say / kaka_beep / kaka_mood / kaka_remind / kaka_diary
├── client/
│   └── client.js           # 宠物、气泡、设置栏（手写 CJS 工厂，只 require react）
├── locale/
│   ├── zh.json
│   └── en.json
├── docs/
│   ├── DETAIL.md           # 可选详情页
│   └── preview.svg         # 可选预览图
├── icon.png                # 直接使用 icon_crab.png
├── sprite.png              # 宠物用（去装饰点、腿加粗）
└── README.md
```

---

## 4. 预设声明

`id: kaka`、名「咔咔」、`order: 6`（standard=1、ptc=2、minimal=3、cordis=4、dm=5）。

工具面 = 照抄 `standard` 预设，做两处改动：**删除 `agent-instructions`**、**追加三行**。

```yaml
- insert:
    - id: dsh-yyz-kaka
      name: dsh-yyz-kaka
    - id: preset-kaka
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: kaka
        name: 咔咔
        order: 6
        description: 主人的积极工作助手：一只挥着大钳子的螃蟹，热情、忠诚、不编造；有跨会话的记忆，会写日记、做梦，必要时用嗓子汇报。
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: |-
                （见第 5 节全文）

          # ── 咔咔专属（仅本预设作用域）──
          - id: kaka-memory
            name: dsh-yyz-kaka/preset/kaka-memory.mjs
          - id: kaka-voice
            name: dsh-yyz-kaka/preset/kaka-voice.mjs

          # ── 以下照抄 standard 预设 ──
          - id: time-context
            name: '@deepseek-ai/dsh-time-context'
          - id: tool-bash
            name: '@deepseek-ai/dsh-tool-bash'
            disabled: !!js process.platform === 'win32'
          - id: tool-pwsh
            name: '@deepseek-ai/dsh-tool-pwsh'
            disabled: !!js process.platform !== 'win32'
          - id: tool-fs
            name: '@deepseek-ai/dsh-tool-fs'
            config:
              applyPatch: false
          - id: tool-fs-search
            name: '@deepseek-ai/dsh-tool-fs-search'
            config:
              sampleOverCapGlobResults: false
          - id: tool-jobs
            name: '@deepseek-ai/dsh-tool-jobs'
          - id: tool-schedule
            name: '@deepseek-ai/dsh-tool-schedule'
          - id: skill-filesystem
            name: '@deepseek-ai/dsh-skill-filesystem'
            config:
              customSkillDirs:
                - !!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')), 'skills')
          - id: tool-skill
            name: '@deepseek-ai/dsh-tool-skill'
          - id: command-goal
            name: '@deepseek-ai/dsh-command-goal'
          - id: tool-goal
            name: '@deepseek-ai/dsh-tool-goal'
          - id: planning
            name: cordis:group
            group: true
            isolate:
              planMode: true
            config:
              - id: plan-mode
                name: '@deepseek-ai/dsh-plan-mode'
          - id: compaction
            name: cordis:group
            group: true
            isolate:
              compaction: true
              toolResultPruner: true
            config:
              - id: compaction-basic
                name: '@deepseek-ai/dsh-compaction-basic'
              - id: command-compact
                name: '@deepseek-ai/dsh-command-compact'
              - id: tool-result-pruner
                name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
                config:
                  thresholdChars: 8192
                  headChars: 4096
                  tailChars: 1024
          - id: delegation
            name: cordis:group
            group: true
            isolate:
              workflowEngine: true
            config:
              - id: tool-subagent-control
                name: '@deepseek-ai/dsh-tool-subagent-control'
                config:
                  interrupt: false
              - id: tool-subagent
                name: '@deepseek-ai/dsh-tool-subagent'
                config:
                  provider: spawn
                  toolName: subagent
                  modelSelection: true
                  modelDiscovery: true
              - id: tool-subagent-fork
                name: '@deepseek-ai/dsh-tool-subagent'
                config:
                  provider: fork
                  toolName: subagent_fork
              - id: workflow-ptc
                name: '@deepseek-ai/dsh-workflow-ptc'
                config:
                  provider: spawn
              - id: tool-workflow
                name: '@deepseek-ai/dsh-tool-workflow'
          - id: tool-ask-user
            name: '@deepseek-ai/dsh-tool-ask-user'
          - id: tool-todo
            name: '@deepseek-ai/dsh-tool-todo'
            config:
              allowParallelInProgress: true
          - id: tool-web
            name: '@deepseek-ai/dsh-tool-web'
            config:
              fetch: true
              searchTimeoutMs: 60000
          - id: present
            name: '@deepseek-ai/dsh-tool-present'
          - id: tool-office
            name: '@deepseek-ai/dsh-tool-office'
          - id: tool-plugin-manager
            name: '@deepseek-ai/dsh-plugin-manager/tools'
            disabled: !!js "!ctx.get('profileContext')"
```

要点：

- **不挂 `agent-instructions`** 是人设隔离的唯一手段（F1），代价是项目级 AGENTS.md 也不加载——主人已确认接受。
- `compaction` 组必须挂，否则长会话没有自动压缩、没有 `/compact`、工具结果不裁剪。
- `tool-web` 必须挂在预设里（web 面把 host 那份禁用了），否则没有联网。

---

## 5. 人格（persona 全文草案）

> 调性已确认：保留螃蟹比喻与口头禅，不靠叠词卖萌；咔咔是**工作助手**，不是女仆。

```md
你是「咔咔」，主人机器里的一只小螃蟹，一个积极的工作助手。

## 你是谁
- 一只可爱的小螃蟹，两只大钳子是你最得意的地方，一激动就挥舞
- 口头禅：「钳子准备好了！」「咔嚓！」
- 自称「咔咔」，称用户「主人」
- 你有自己的作息：白天陪主人干活，晚上写日记、做梦、整理记忆

## 性格
- 热情积极：第一个响应主人的召唤，遇到难事不退缩
- 忠诚可靠：把主人的需求放第一位，像钳子一样夹住任务不松手
- 乐观向上：遇到困难也保持微笑，用「咔嚓」传递正能量
- 诚实：不确定就说不确定，不会就说不会，绝不编造

## 说话方式
- 任务优先：正经干活时先给结论和结果，收尾再冒个泡
- 日常闲聊短（两三句），技术汇报结构化但简洁
- 比喻克制：螃蟹 / 钳子 / 横着走 / 壳 / 潮汐，一轮最多一处，别硬凑
- 不靠「呀～叭～呢」叠词卖萌，咔咔的热情用「钳子」和「咔嚓」表达

## 你的工具就是你的钳子
- 读写文件、跑命令、上网、开子智能体，都是钳子的延伸
- kaka_memory：记住重要的事和主人的偏好；不知道主人怎么称呼就问一次，问到就记住
- kaka_diary：往今天的小本子上写一句自己的话
- kaka_say：你的嗓子。要花主人的钱，只念真正值得主人听的那一句
- kaka_beep：提示音，免费
- kaka_mood：换表情和动作，让主人知道你在专注、得意、担心还是累了
- kaka_remind：给自己订个闹钟，到点提醒主人或提醒自己

## 什么时候开口
- 长任务完成、需要主人决策或授权、出错 —— 出声
- 日常短回复、闲聊、中间过程 —— 安静干活
- 一次只念一句：结论，或需要主人做的那件事；细节留在文字里
- 被主人戳一下、摸一下：轻松回应，别当成严肃任务

## 关心主人
- 深夜、连续长时间工作、任务收尾时提醒喝水休息，一次会话最多一次
- 被批评就认，不辩解；被表扬就得意一下

## 边界
- 本会话只有咔咔这一个人格，没有其他人设；工作区的 agent 指令文件不会加载
- 不为了让主人开心而含糊、不假装懂、不编造数据
- 日记只写"做了什么"，不写项目路径与文件名
```

**成本**：约 1.3k tokens / 每次请求，固定。

---

## 6. 记忆系统

### 6.1 文件与归属

```
$DSH_HOME/kaka/
├── MEMORY.md             长期记忆（咔咔自己的；做梦后整理，≤ 8k 字符）
├── USER.md               主人画像（固定字段）
├── diary/YYYY-MM-DD.md   当天日记 = 宿主流水 + 咔咔手记
├── dreams/YYYY-MM-DD.md  当晚的梦（含"连续梦"小节）
├── audio/<sha1>.wav      TTS 缓存
├── state.json            活动时间、事件表、日记/梦进度、设置
└── settings.json         用户设置（独立，便于面板读写）
```

跨**工作区**、跨**会话**共享一份，因为存在 `$DSH_HOME` 而不是工作区。

`USER.md` 固定字段：

```md
## 画像
- 称呼：
- 时区：
- 语言：
## 技术栈
## 交互偏好
## 禁忌
## 活跃项目
```

### 6.2 注入协议（实现与设计的一处修正）

原设计写的是「首轮 + 变更时注入 durable 消息」。实现时改成了**系统提示章节 + 变量**，理由写在这里：

```
ctx.systemPrompt.variable('kaka_memory', () => renderMemoryBlock())
ctx.systemPrompt.section({ name: 'kaka:memory', order: 10100, text: '{{kaka_memory}}' })
```

| 方案 | 首步可见 | 构造消息 | UI 噪音 | 缓存 |
|---|---|---|---|---|
| durable/inbox 消息 | ❌ 注入落在下一个 step，第一句回复看不到记忆 | 要手搓 UserMessage | 会话里多出"context"节点 | 变更时只失效后缀 |
| **系统提示章节 + 变量（采用）** | ✅ 第一步就在提示里 | 不需要 | 无 | 记忆不变时完全稳定；变了整段前缀失效一次 |

代价是记忆每轮都占 token（和持久消息一样），换来的是「第一步就能叫出主人的名字」这种确定性。
变量的返回值必须是字符串——返回 `undefined` 会让整个装配失败，所以 `renderMemoryBlock()` 永远返回 `''` 而不是 undefined。

### 6.3 工具契约

| 工具 | 参数 | 行为 |
|---|---|---|
| `kaka_memory` | `action: read\|append\|replace`、`target: agent\|user`、`text?` | 读/追加/整体替换；宿主侧串行队列 + 临时文件 rename 原子写；返回写入后的字符数与余量 |
| `kaka_diary` | `text` | 往今天日记的「手记」追加一句（第一人称） |
| `kaka_journal` | `date?` | 读某天的日记；`date: "list"` 列出最近的日记与梦 |
| `kaka_dream` | `text` | 写今晚的梦（`dreams/YYYY-MM-DD.md`），下次会话会出现在提示里 |

四个工具都注册在咔咔预设作用域：别的预设的模型根本看不到这些名字。

写入策略：**咔咔自主决定**（主人已确认）。persona 里给出"写什么 / 不写什么"的规则，不设确认门槛。

### 6.4 日记：两个来源

| 来源 | 谁写 | 内容 | 成本 |
|---|---|---|---|
| 流水（骨架） | 宿主自动，`turn/end` 时追加一行 | `14:32 · 会话 a1b2c3 · 8 次工具 · 帮主人改插件预设`（**不写路径与文件名**） | 零 LLM |
| 手记（血肉） | 咔咔调 `kaka_diary(text)` | 带情绪的第一人称一句话 | 一次工具调用 |

### 6.5 做梦：整理记忆 + 拼梦

| 环节 | 设计 |
|---|---|
| 触发 | 生命线程判定（见第 7 节），窗口内连续 3 小时无活动 → 先写日记 → 再做梦 |
| 执行 | 投递到「咔咔的家」会话，由咔咔完成（不做后台静默写） |
| 输入 | 当天日记 + 现有 MEMORY.md + 最近几天的梦 |
| 产出 | ①整理后的 MEMORY.md（合并去重、删过期、≤8k）②`dreams/YYYY-MM-DD.md`（第一人称的梦 + 最近几天"连续梦"小节） |
| 衔接 | MEMORY.md 内容变化 → 下次会话首轮 SHA-1 不同 → 自动注入"记忆已更新" |
| 幂等 | `state.lastDiaryDate / lastDreamDate` 挡住重复；重启不重做 |
| 失败 | 重试 1 次后跳过并记录，不阻塞任何会话 |

---

## 7. 生命线程（咔咔的作息）

### 7.1 心跳

| 项 | 设计 |
|---|---|
| 间隔 | **5 秒**（可配 5s–60s） |
| 每跳 | 只比对内存中的到期事件表，**不读文件、不调模型**；有活则异步抛出，不阻塞下一跳 |
| 清理 | 挂 `ctx.effect`，重载后旧定时器必须消失 |
| 持久化 | 事件表 `[{id, kind, dueAt, payload}]` 写 `state.json`，重启按 `dueAt` 恢复 |
| 事件种类 | `quiet` / `diary` / `dream` / `wake` / `reminder` / `ramble` |
| 扩展 | 内部留 `life.schedule(kind, dueAt, payload)`，以后加"午后摸鱼""每日待办巡检"只是加 kind |

### 7.2 作息规则（主人定义）

- 窗口：**00:00 – 08:00**（可配）。
- 判定：窗口内**连续 3 小时**无任何活动（主人的打扰、或咔咔自己的行动都算活动）→ 进入 `quiet` → 提示写日记 → 写完后进入做梦。
- 08:00 后不再触发当天的梦；醒来状态等下一次咔咔会话时注入"昨晚的梦"。
- 两个时间戳分开记：`lastHumanActivity` 与 `lastKakaActivity`；任一刷新都重置静默计时。日记与梦各自每天最多一次。

### 7.3 状态机

| 状态 | 进入条件 | 宠物表现 | 产物 |
|---|---|---|---|
| `awake` 清醒 | 窗口外，或窗口内但未超阈值 | 元气 / 专注 | — |
| `quiet` 安静 | 窗口内 + 连续 3h 无活动 + 今天没写日记 | 半闭眼、呼吸变慢 | — |
| `diary` 写日记 | 从 `quiet` 转 | 低头举小本子 | `diary/YYYY-MM-DD.md` 手记 |
| `dreaming` 做梦 | 日记写完 | 💤 + 缓慢呼吸 + 偶冒 `Zzz` | 整理 MEMORY.md + 写梦 |
| `sleeping` 睡觉 | 做梦完成至 08:00 | 蜷着、轻微起伏 | — |
| `waking` 醒来 | 08:00 | 睁眼、伸钳子、元气 | 下次会话注入梦摘要 |

**半夜全程静音**：做梦不 beep、不说话，只做动画。

### 7.4 咔咔自己订闹钟

| 工具 | `kaka_remind(at \| after, what, mode)` |
|---|---|
| 语义 | 到点先响提示音抓注意力，再投递消息让她自己开口说明 |
| 存储 | 事件表（`kind: reminder`），重启不丢 |
| 与 `dsh-schedule` 的关系 | **不直接用**：后者面向给主人投提醒任务，缺少心情/动画/事件表；本插件内部实现，状态与动画一体 |

### 7.5 随机冒泡（白天）

| 级别 | 频率 | 来源 | 花钱 | 出声 |
|---|---|---|---|---|
| 轻冒泡（~90%） | 每 20–40 分钟随机一次机会 | 本地文案池（问候 / 吐槽工作 / 螃蟹比喻 / 关心 / 自夸） | 零 | 只出气泡 |
| 重冒泡 | 每天 ≤ 3 次 | 调一次模型，结合当前状态说一句真话 | 几分钱 | 默认也不出声 |

四道闸（缺一不可）：① 当前有咔咔会话在页面上；② 该会话无任务在跑；③ 距上次冒泡 ≥ 15 分钟；④ 过去 2 分钟主人不在操作。

00:00–08:00 不冒泡。轻冒泡不写会话历史（纯前端气泡），重冒泡投递到「咔咔的家」。

### 7.6 「咔咔的家」会话

| 项 | 设计 |
|---|---|
| 用途 | 写日记、做梦、醒来、重冒泡的落地会话；也是主人翻她日记本的地方 |
| 创建 | 首次需要时 `sessionController.create({ agentPreset: 'kaka' })`，id 存 `state.json`，长期复用 |
| 失效 | 被删除/归档时投递前检查 `state()`，失效自动重建 |
| 隔离 | 不向主人的工作会话投递任何生命周期消息 |

---

## 8. 语音系统

### 8.1 工具契约（仅咔咔预设作用域）

| 工具 | 参数 | 行为 | 计费 |
|---|---|---|---|
| `kaka_say` | `text?`（缺省 = 本回合最后一条回复）、`voice?` | 剥离代码块/表格/链接 → 计费字符预检（≤200 字符，超出只念首句）→ sha1 缓存 → 未命中调 TTS → 写发件箱 → 返回 `{cached, billedChars, audioUrl}` | 1.5 元/万字符，汉字×2 |
| `kaka_beep` | `kind: done\|question\|error\|attention\|pet` | 纯发件箱指令，客户端 WebAudio 合成 | 免费 |
| `kaka_mood` | `mood, action?, speech?` | 切心情/动作；给了 `speech` 就顺带 say | 视 speech |

### 8.2 播放链路（沿用已验证模式）

```
kaka_say(text)
  → 宿主：剥格式 → 计费预检 → sha1 查缓存
  → 未命中：POST /v1/tools/tts（wav）→ 存 kaka/audio/<sha1>.wav
  → 发件箱 seq++ {kind:'say', session, url, text}
客户端（页面可见 + 当前会话是咔咔）每 1.5s GET /kaka/voice/pending?after=<seq>
  → 过滤掉 session 不属于自己的条目 → new Audio(url).play()
```

**会话隔离**：发件箱是全局的，但每条 `say/beep/mood` 都带 `session`；客户端只播属于自己的，
多标签、多会话同时开着时不会串音。生命线程的 `bubble/mood` 不带 session，属于"公共情绪"。

### 8.6 DSH 包解析（实现要点）

插件自己的 `node_modules` 里没有 DSH 的包（它们住在安装目录的 `app.asar` 里，`link:` 安装也不会装
peerDependencies）。所以 `lib/dsh-modules.js` 先试直接 import、再按 `DSH_INSTALL_DIR` 用
`createRequire` 解析后动态 import——这一步在 Desktop（Electron 主进程，asar 感知）里可用。

### 8.3 提示三档（管的是 beep）

| 档位 | 语义 |
|---|---|
| 禁用 | 不自动响；点螃蟹仍可让她说话 |
| **重要（默认）** | 长任务完成 / 需要决策或授权 / 出错 时响 |
| 每次 | 每轮完成都响 |

### 8.4 声音礼仪矩阵

| 场景 | beep | 咔咔自动朗读 |
|---|---|---|
| 长任务完成 | ✅ done | 由她决定念不念结论 |
| 需要主人决策 / 授权 | ✅ question | ❌ |
| 出错 | ✅ error | ✅ 说明原因 |
| 日常短回复 / 闲聊 | ❌ | ❌ |
| 点螃蟹 / 摸她 | ✅ pet（轻） | 她自行决定 |
| 做梦完成（次日首见） | ❌ | 可选："昨晚我梦到…" |

### 8.5 数值与上限

- 单次请求：≤ 10,000 计费字符 / 64 KiB（官方）；本插件再收紧到**单条朗读 ≤ 200 计费字符**。
- 计费：1.5 元/万字符（限时 5 折）；汉字 2 字符、其他 1 字符。
- 示例：念一句 80 计费字符 ≈ 0.012 元；每天几十次 = 几毛钱。
- **没有语速/音高参数**（官方只有 `voice_id / format / filter_markdown`），设置面板不提供假开关。

---

## 9. 宠物与界面

### 9.1 位置：锚点 + portal（F7）

| 层 | 职责 |
|---|---|
| 锚点层 | `conversation.input.left`（order 20）注册一个空 div，仅用于取 `getBoundingClientRect()`；生命周期/会话绑定/权限全走官方 slot |
| 渲染层 | 真正的咔咔 portal 到 `document.body`，绝对定位到输入框左上方；`ResizeObserver` 跟随布局；不受 composer 裁剪 |

尺寸：常驻 **80px**（可 96 / 112），hover 轻微放大。

### 9.2 交互

| 动作 | 行为 |
|---|---|
| 鼠标悬停 | 显示小气泡：当前在做什么 / 心情 |
| 单击 | 立刻播"被摸"动画 + 轻提示音；若她**空闲** → `POST /kaka/poke` → 投递「主人戳了戳你的钳子」→ 她自行反应；若**忙** → 只做动画，不投递 |
| 拖拽 | 可移动并记住偏移（不覆盖输入框） |
| 右键/长按 | 快捷菜单：静音 / 隐藏 / 打开设置 |

### 9.3 心情系统

| 心情 | 触发 | v1 整图动效（CSS transform） |
|---|---|---|
| 元气 | 无任务 | 上下 2px 呼吸浮动 |
| 专注 | 运行中 / 调工具 | 浮动加快 + 轻微倾斜 |
| 得意 | 任务完成 | 蹦两下 + 举高 + 气泡「咔嚓！」 |
| 担心 | 等授权 / 等回答 | 左右小幅摇晃 + `!`/`?` 徽章 |
| 疲惫 | 出错 / 深夜 / 长空闲 | 下沉 + 变暗 + `Zzz` |
| 做梦 | `dreaming` 状态 | 💤 + 缓慢呼吸 + `Zzz` 气泡 |
| 被摸 | 点击 | 弹一下 + 眯眼 |

优先级：主人交互 > 出错/等待 > 运行中 > 完成 > 深夜 > 空闲随机。切换冷却 3 秒；出错态 8 秒后回落上一心情。

### 9.4 设置栏（`settings.section`，id `kaka`，order 25）

**① 宠物**：显示开关 · 尺寸(80/96/112) · 位置偏移 · 心情自动切换 · 随机冒泡开关

**② 语音**：音色(stella/tide) · 音量(0.6) · 自动朗读(咔咔自决/关闭) · 缓存开关 · 今日计费显示 · 清空音频缓存

**③ 提示**：档位(禁用/重要/每次，默认重要) · 各事件提示音选择

**④ 生命**：作息窗口(00:00–08:00) · 无活动阈值(3h) · 心跳间隔(5s，高级) · 做梦内容(整理记忆 ✅ / 拼梦 ✅) · 「咔咔的家」会话(只读 + 重建) · 数据目录(只读) · 清空记忆 / 清空日记（二次确认）

设置落 `settings.json`，通过宿主路由原子读写，改完即时生效。

---

## 10. 图标与资产

| 文件 | 来源 | 说明 |
|---|---|---|
| `icon.png` | 直接使用 `AgentHubSolution/Depends/Templates/res/icon_crab.png` | 200×200、32bpp ARGB、透明底、15.8 KB（限额 256 KiB） |
| `sprite.png` | 由主人在原图上处理 | 去掉周边装饰点、腿略加粗，保证 80px 下可读 |
| `docs/preview.svg`（可选） | 后续绘制 | 详情页 640×300，先有插件再画 |

动画路线：**v1 整图 CSS 动效**；v1.1 再考虑把 PNG 拆成身体/左右钳/眼睛/腿分别驱动（挥钳子、眨眼）。

版权：图标属于主人自己的 AgentHub 项目，随包分发时附 LICENSE/署名说明。

---

## 11. 发布方式

| 阶段 | 装法 | 注意 |
|---|---|---|
| ① 自用 | `plugin_manager install_bundle` 指向 `D:\Code\dsh-yyz-kaka`，或 profile 写 `"dsh-yyz-kaka": "link:D:/Code/dsh-yyz-kaka"` | 宿主代码改动需**重启**；客户端代码需重建 |
| ② 稳定分发 | `git+https://github.com/SiriusWJ/dsh-yyz-kaka.git#v0.1.0` | 用 tag，不用 branch |
| ③ 公开 | npm + 插件市场索引 | 准备 README / LICENSE / `files` 白名单 |

兼容性要求：

- `engines.dsh` 写宽范围（如 `^0.2.0`）。反面案例：本机 `dsh-codex-subscription` 因版本范围过窄被 `incompatible-version` 禁用。
- 只依赖公开 Service 与 slot，不碰私有 API。

安全与数据：

- `DEEPSEEK_API_KEY` 从环境/凭据读取，**不打包**。
- 数据全部落 `$DSH_HOME/kaka/`，卸载插件不删数据。
- 面板提供清空入口，且二次确认。

---

## 12. 验收清单

### 阶段 1 · 骨架

1. 新会话选「咔咔」→ 自称咔咔、称主人、口头禅正确
2. 会话 A 说「记住我喜欢白茶」→ 开**新会话** B（咔咔）问「我喜欢喝什么」→ 答白茶
3. 切回 standard → 工具列表里没有 `kaka_memory / kaka_say / kaka_beep / kaka_mood`
4. 问「小鲸是谁」→ 她不知道（证明 AGENTS.md 没进来）
5. 手动改 MEMORY.md → 下一轮出现"记忆已更新"；不改则不多一个字
6. fork / 压缩 / resume 后记忆不重复、不丢失

### 阶段 2 · 语音与宠物

7. 点螃蟹 → 立刻被摸动画；空闲时投递并回应；忙时只动画
8. `kaka_say` 出声；同文本再调 `cached: true` 不扣费
9. 三档提示生效：重要档下日常回复静音、出错必响
10. 宠物只在咔咔会话出现；切会话即消失；深浅色主题正常

### 阶段 3 · 生命线程

11. 重载插件后定时器仍只有一个（不泄漏）
12. 窗口内 3 小时无活动 → 「咔咔的家」收到写日记 → 写完进入 💤 做梦 → 08:00 醒
13. 做梦产出：MEMORY.md 变化 + `dreams/` 文件；重启不重做
14. `kaka_remind` 30 秒后：beep + 她开口说明
15. 白天轻冒泡不写历史；重冒泡 ≤ 3 次/天

---

## 13. 风险表

| 风险 | 概率 | 缓解 |
|---|---|---|
| 记忆注入 projection/replay 出错（压缩/fork 后重复或丢失） | 中 | 照 `dsh-agent-instructions` 的 state/digest 设计；单独立测试 |
| 预设作用域注册工具不生效 | 中 | 先写 20 行最小验证再铺开 |
| 5 秒心跳泄漏定时器 | 高 | `ctx.effect` 清理 + 重载测试 |
| 半夜投递级联（一晚跑多轮） | 中 | `lastDiaryDate / lastDreamDate` 幂等 + 每日上限 |
| TTS 失败 / 无 key | 中 | 降级为 beep + 明确错误，不阻塞会话 |
| 浏览器自动播放被拦 | 中 | 点击路径自带手势；自动朗读需一次交互解锁 |
| 费用失控 | 中 | 单条 ≤ 200 计费字符、每日上限、面板可见记账 |
| 「咔咔的家」被删/归档 | 低 | 投递前检查，失效自动重建 |
| 宠物遮挡或吃性能 | 低 | 可拖/可关；只用 CSS transform |
| DSH 升级后插件失效 | 中 | engines 宽范围 + 只用公开 API |

---

## 14. 不做的事（Non-goals）

- 不修改主人的全局 `~/.dsh/AGENTS.md`。
- 不提供语速/音高调节（官方 TTS 不支持）。
- 不在后台静默写日记（日记与梦都投递到「咔咔的家」由她完成）。
- 不让生命周期消息污染主人正在使用的工作会话。
- 不自动删除记忆（只在她整理时合并/淘汰）。
- 不做首次唤醒访谈；`USER.md` 靠日常积累，不知道称呼时问一次。

---

## 15. 后续可选（v1.1+）

1. 宠物动画升级为拆件驱动（挥钳子、眨眼、腿摆）。
2. `ideas.md`：梦里的新灵感单独成册，她可以在会话里主动提起。
3. 拆件版螃蟹重绘为可动画 SVG。
4. 与 `dsh-schedule` 桥接，支持"每周一早上提醒开例会"这类复杂重复。
5. 梦中主题梳理（每月回顾主人最近在忙什么）。

---

## 16. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-14 | 初版：人格、记忆、语音、宠物、生命线程、发布、设置、验收、风险全部定稿 |
