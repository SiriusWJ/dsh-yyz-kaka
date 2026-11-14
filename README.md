# 咔咔 Kaka · DeepSeek Harness 插件

> 一只住在 DeepSeek Harness 里的小螃蟹工作助手。
> 她有自己的**人格预设**、**跨会话共享的记忆**、**嗓子**，以及一条 **5 秒一跳的生命线程**。

<p align="center">
  <img src="sprite.png" width="120" alt="咔咔" />
</p>

---

## 这是什么

咔咔最初住在 [AgentHubSolution](https://github.com/SiriusWJ) 里——一只挥着大钳子的螃蟹，
负责给主人干活。这个插件把她搬进 DeepSeek Harness，并且补上了三件在 Harness 里才做得成的事：

| 能力 | 说明 |
|---|---|
| **独立人格预设** | 一个名为「咔咔」的 Agent 预设。**不加载任何 `AGENTS.md`**，所以不会被别的人设串味；也不影响其他预设 |
| **共享记忆** | `MEMORY.md`（她自己的长记忆）+ `USER.md`（主人画像），存在 `$DSH_HOME/kaka/`，**所有咔咔会话共享一份** |
| **日记与梦** | 白天记流水、她自己写手记；夜里窗口内连续 3 小时没人打扰，就写日记、然后做梦整理记忆 |
| **嗓子** | `kaka_say` 调 DeepSeek 官方 TTS 说话（按字符计费、带缓存），`kaka_beep` 是免费提示音 |
| **宠物** | 输入框旁边常驻的一只螃蟹，会随心情换动作；点一下 = 摸摸她，她会自己回应 |
| **生命线程** | 5 秒心跳驱动作息、闹钟、冒泡；线程本身不花 token，只有写日记/做梦各调一次模型 |

## 安装

```powershell
# 图形界面：侧栏「插件」→「添加插件」→ 填本地目录
# 或者命令行：
dsh plugin --profile desktop add link:D:/Code/dsh-yyz-kaka
```

装好后重启 DSH（宿主代码需要重启才加载）。新建会话时在预设里选「咔咔」。

## 用它

1. **新建会话 → 选「咔咔」**。她会以咔咔的身份出现，并且只能看到 `kaka_*` 这些工具。
2. **输入框旁会出现螃蟹**。点一下 = 戳她，她会回一句/换个心情。
3. **记忆是自动的**：她认为值得记的事会自己写进 `MEMORY.md`；想知道什么直接问。
4. **设置**：设置 → 插件 → 「咔咔」tab，可以调宠物大小、音色、音量、提示档位、作息窗口，以及清空记忆/日记。
5. **翻她的小本子**：咔咔会话的对话区顶部有「咔咔」页签，能看日记、梦、长记忆与主人画像（只读）。

### 她能用哪些工具

只有咔咔会话可见（其他预设的模型根本看不到这些名字）：

| 工具 | 作用 |
|---|---|
| `kaka_memory` | 读/写长期记忆（`agent` 或 `user`） |
| `kaka_diary` | 在今天日记的「手记」里写一句 |
| `kaka_journal` | 读今天的日记 / 列出最近写过哪些天 |
| `kaka_dream` | 写下今晚的梦 |
| `kaka_say` | 用 TTS 说话（默认念她上一条回复） |
| `kaka_beep` | 提示音（免费） |
| `kaka_mood` | 切心情/动作，可顺带说一句 |
| `kaka_remind` | 给自己订闹钟（存进生命线程，重启不丢） |

其余工具面照抄 `standard` 预设（文件、Shell、搜索、联网、子智能体、技能、计划、压缩）。

## 数据与隐私

全部落在 `$DSH_HOME/kaka/`（Windows 默认 `C:\Users\<你>\.dsh\kaka\`）：

```
MEMORY.md            她的长记忆
USER.md              主人画像
diary/YYYY-MM-DD.md  每天的日记（只有咔咔写的第一人称散文）
journal/YYYY-MM-DD.md 当天的素材（宿主自动记的机械事实，只给她写日记时参考）
dreams/YYYY-MM-DD.md 每晚的梦
audio/<sha1>.wav     TTS 缓存（同一句不重复计费）
state.json           活动时间、闹钟事件、日记/梦进度、计费
settings.json        设置面板写入的配置
```

- **卸载插件不会删除这些数据**；设置页有「清空记忆 / 清空日记」按钮（二次确认）。
- 日记只写「做了什么」，**不写项目路径与文件名**。
- 语音走 `https://api.deepseek.com/v1/tools/tts`，**优先使用 DSH 凭据服务里已存的
  `DEEPSEEK_API_KEY`**（设置页的模型凭据），其次读环境变量，最后兜底直读
  `$DSH_HOME/.credentials.yaml`。轮换 key 不需要重启。
  计费：1.5 元 / 万字符，**汉字算 2 个字符**；插件默认单条最多 200 计费字符（超出只念首句），
  同文本命中缓存不扣费。没有 key 时只是不能说话，其他功能不受影响。
- 注意：**登录账号的会话 token 不能用于 TTS**（那是平台令牌，不是 API Key）。

## 开发

```powershell
npm run check      # 六个模块语法自检
npm test           # 运行时单测（13 条）
npm run smoke:client   # 客户端 bundle：注册 + 迷你渲染 + 分支断言
npm run smoke:presets  # 预设插件冒烟（需要 DSH 的 Electron 运行时）
npm run sprite     # 重新生成宠物精灵图
npm run preview    # 重新生成详情页预览图
```

调试与验收工具（直接打宿主本地接口）：

```powershell
node tools/acceptance.mjs <baseUrl>         # 一键验收：建会话 → 戳她 → 写日记 → 做梦
node tools/inspect-session.mjs [sessionId]  # 读会话日志：预设/工具/AGENTS.md/人格
```

宿主调试接口（仅本地同源可用）：

| 接口 | 作用 |
|---|---|
| `POST /kaka/home` | 确保「咔咔的家」存在（复用，不会重复创建） |
| `POST /kaka/poke` | `{sessionId, text?}` 戳她；带 `text` 就是一句指定的话 |
| `POST /kaka/life/force` | `{kind}` = diary / dream / ramble / wake / reminder，立刻做一次 |
| `POST /kaka/life/debug` | 直接改生命计时器（验收用） |

结构：

```
lib/runtime.js          宿主运行时（记忆/日记/梦/计费/发件箱/事件表/作息判定）
lib/index.js            宿主插件（路由 + 生命线程 + 会话观察 + 咔咔的家）
preset/kaka-memory.mjs  预设作用域：记忆注入 + 记忆/日记工具
preset/kaka-voice.mjs   预设作用域：嗓子、心情、闹钟
client/client.js        浏览器面：宠物、声音、设置页
cordis.patch.yml        宿主行 + preset-kaka 声明
```

设计文档见 [DESIGN.md](DESIGN.md)。

## 许可

MIT。螃蟹形象来自作者自己的 AgentHub 项目资产。
