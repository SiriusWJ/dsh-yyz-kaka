# 发布清单

> 目标：把 `dsh-yyz-kaka` 从本地自用推到可分发状态。

## 1. 发布前自检（一条命令跑完）

```powershell
npm run check        # 六个模块语法
npm test             # 运行时单测 13 条
npm run smoke:client # 客户端注册 + 渲染 + 分支断言
npm run smoke:presets # 预设 8 工具 schema（需 Electron 运行时 + DSH_INSTALL_DIR）
```

## 2. 打包检查

```powershell
npm pack --dry-run
```

应包含：`lib/`、`preset/`、`client/`、`locale/`、`docs/`、`icon.png`、`sprite.png`、
`cordis.patch.yml`、`README.md`、`LICENSE`、`package.json`。
**不应**包含：`tools/`、`tests/`、`DESIGN.md`、`VERIFICATION.md`、`node_modules/`。

## 3. 版本与标签

```powershell
# 版本号在 package.json；这里是首个可用版本
git tag -a v0.1.0 -m "咔咔 0.1.0：独立预设、共享记忆、日记与梦、嗓子、宠物、生命线程"
git push origin main --tags
```

## 4. 三种安装方式

| 场景 | 命令 |
|---|---|
| 本地开发（跟随源码） | `dsh plugin --profile desktop add link:D:/Code/dsh-yyz-kaka` |
| 从 Git 装（锁定 tag） | `dsh plugin --profile desktop add git+https://github.com/SiriusWJ/dsh-yyz-kaka.git#v0.1.0` |
| npm（发布后） | `dsh plugin --profile desktop add dsh-yyz-kaka@0.1.0` |

安装后**重启 DSH**（宿主代码与预设 `.mjs` 都按模块缓存加载）。
客户端 `client.js` 在页面加载时取，刷新即可。

## 5. 发布到 npm（可选）

```powershell
npm publish --access public
```

注意：`peerDependencies` 里的 `@deepseek-ai/dsh-tools` 是 DSH 安装自带的包，
不在公共 npm 上，所以它标了 `optional: true`，安装时不会拉取。
插件运行时通过 `lib/dsh-modules.js` 从 `DSH_INSTALL_DIR` 解析它。

## 6. 发布后验证（10 分钟）

1. 新建会话选「咔咔」，问「你是谁」→ 应是螃蟹人格；
2. 让她记住一件事 → 新开咔咔会话问她 → 应能复述；
3. 点输入框旁的螃蟹 → 有被摸反馈；
4. 设置 → 咔咔 → 五组设置都能改，改完立刻生效；
5. `/kaka/diaries` 能看到日记与梦（或设置页「去她家看看」）；
6. 切回 standard 预设 → 工具列表里没有 `kaka_*`。

## 7. 已知未验证项

- 宠物在真实页面里的**观感**（位置、大小、动效舒适度）需要人眼确认；
- 夜间作息需要真实跨过 00:00–08:00 窗口跑一次（已用 `/kaka/life/force` 与调试接口模拟验证逻辑）。
