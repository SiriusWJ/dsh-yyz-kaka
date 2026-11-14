/**
 * 解析 DSH 自己发布的包（@deepseek-ai/*）。
 *
 * 为什么需要这一层：插件是"被 DSH 加载的第三方包"，它自己的 node_modules 里
 * 并没有 DSH 的包（那些住在安装目录的 app.asar 里，而且 `link:` 安装也不会
 * 给我们装 peerDependencies）。所以 `import '@deepseek-ai/dsh-tools'` 在
 * 我们的文件里是解析不到的，必须**从 DSH 安装目录**解析出来再动态 import。
 *
 * 解析顺序：
 *   1. 直接 import —— 开发时如果包目录里恰好有 node_modules 链接，这条路最快；
 *   2. 从 `DSH_INSTALL_DIR`（DSH 进程注入的环境变量）解析；
 *   3. 从 `process.argv[1]`/`require.main` 所在的 node_modules 猜一次（兜底）。
 *
 * 注意：第 2 条在 Desktop（Electron 主进程）里可用 —— Electron 的 fs 补丁
 * 能读 app.asar，动态 import 也因此能加载 asar 里的 ESM。
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const cache = new Map()

/**
 * 加载一个 DSH 包。
 * @param {string} specifier 例如 '@deepseek-ai/dsh-tools'
 * @returns {Promise<any>}
 */
export async function loadDshPackage(specifier) {
  if (cache.has(specifier)) return cache.get(specifier)

  const errors = []

  // ① 直接 import
  try {
    const mod = await import(specifier)
    cache.set(specifier, mod)
    return mod
  } catch (err) {
    errors.push(`direct: ${err?.code || ''} ${err?.message || err}`)
  }

  // ② 从 DSH 安装目录解析
  const anchors = []
  if (process.env.DSH_INSTALL_DIR) anchors.push(join(process.env.DSH_INSTALL_DIR, 'package.json'))
  if (process.env.DSH_HOME) anchors.push(join(process.env.DSH_HOME, 'package.json'))

  for (const anchor of anchors) {
    try {
      const require = createRequire(anchor)
      const file = require.resolve(specifier)
      const mod = await import(pathToFileURL(file).href)
      cache.set(specifier, mod)
      return mod
    } catch (err) {
      errors.push(`${anchor}: ${err?.code || ''} ${err?.message || err}`)
    }
  }

  throw new Error(`无法解析 ${specifier}：\n  ${errors.join('\n  ')}`)
}
