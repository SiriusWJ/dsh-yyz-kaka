/**
 * 咔咔预设 · 画笔（agent 作用域）。
 *
 * 只注册在咔咔预设里：别的预设的模型看不到 `kaka_draw`。
 * 画出来的 SVG 存在 `~/.dsh/kaka/art/`，网页通过 `/kaka/art/file/<id>` 或宿主的
 * `api/file?path=…` 显示，所以聊天里能直接看到成品，面板里也能翻。
 */

import { loadDshPackage } from '../lib/dsh-modules.js'
import { log } from '../lib/runtime.js'
import { saveArt } from '../lib/art-store.mjs'

export const name = 'kaka-draw'
export const inject = ['tools', 'systemPrompt']

const KINDS = ['diary', 'user', 'free']
const MAX_CHARS = 40000

/** 画风说明：给模型的硬约束，避免画出跑偏的东西。 */
const DRAW_GUIDE = `## 你的画笔（kaka_draw）

你可以用 \`kaka_draw\` 画 SVG，画完会存进你自己的小本子里，也能直接在对话里显示。

**什么时候画**
- 主人让你画、或者聊天里想"比划一下"（示意图、小图标、心情涂鸦）→ kind=free
- 写日记时想给这一天留一张小画 → kind=diary（会自动归到当天日记页）
- 想画主人的样子 → kind=user（会成为你的"主人画像"，一直保存）

**画风（重要）**
- 扁平、干净、留白多；2～4 个颜色就够，主色参考 #d9482a（橙红）/ #2e2a28（近黑）/ #f4f2ee（米白）
- 线条粗一点（stroke-width 3～6），圆角（stroke-linecap="round"）
- 画布固定写 \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240">\`
- 只用这些元素：svg / g / path / circle / rect / ellipse / line / polygon / polyline / text / tspan / defs / linearGradient / radialGradient / stop
- 不要写 \`<script>\`、\`<foreignObject>\`、\`on*=...\`、外链 \`href\`；不要嵌图片

**画完必须做一件事**
把工具返回的 \`markdown\` 字段原样放进你的回复里（形如 \`![标题](C:\\Users\\…\\art\\xxx.svg)\`，Windows 反斜杠路径），
这样主人才能在对话里看到画。保持反斜杠原样，**不要**换成正斜杠（正斜杠在聊天里渲染不出来）。`

/** 去掉脚本、外链与事件属性；补上必需的根属性。 */
function sanitizeSvg(raw) {
  let svg = String(raw || '').trim()
  if (svg === '') throw new Error('svg 不能是空的')
  if (svg.length > MAX_CHARS) throw new Error(`图太大了：${svg.length} 字符，上限 ${MAX_CHARS}`)
  if (!/^<svg[\s>]/iu.test(svg)) throw new Error('必须以 <svg ...> 开头（只要 SVG 本体，不要 markdown 代码围栏）')

  svg = svg.replace(/<script[\s\S]*?<\/script>/giu, '')
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/giu, '')
  svg = svg.replace(/\son[a-z]+\s*=\s*"[^"]*"/giu, '')
  svg = svg.replace(/\son[a-z]+\s*=\s*'[^']*'/giu, '')
  svg = svg.replace(/\son[a-z]+\s*=\s*[^\s>]+/giu, '')
  svg = svg.replace(/(href|xlink:href)\s*=\s*["'](?!data:)[^"']*["']/giu, '')
  svg = svg.replace(/javascript:/giu, '')

  const head = svg.slice(0, 400)
  if (!/xmlns=/u.test(head)) svg = svg.replace(/^<svg/iu, '<svg xmlns="http://www.w3.org/2000/svg"')
  if (!/viewBox=/u.test(head)) svg = svg.replace(/^<svg/iu, '<svg viewBox="0 0 320 240" width="320" height="240"')
  return svg
}

export async function apply(ctx, config) {
  const { defineTool } = await loadDshPackage('@deepseek-ai/dsh-tools')

  ctx.systemPrompt.section({
    name: 'kaka:draw',
    order: 10102,
    text: DRAW_GUIDE,
  })

  ctx.tools.register(defineTool({
    name: 'kaka_draw',
    description: '画一张 SVG（图标、示意图、涂鸦、主人画像、日记插画都行）。画完把返回的 markdown 原样放进回复里，主人才能看到。',
    parameters: {
      svg: {
        type: 'string',
        required: true,
        description: '完整 SVG 源码，以 <svg ...> 开头，带 xmlns 和 viewBox="0 0 320 240"。不要包 markdown 代码围栏。',
      },
      title: {
        type: 'string',
        required: true,
        description: '给这张画起个名字，2～10 个字。',
      },
      kind: {
        type: 'string',
        enum: KINDS,
        description: 'diary=当天日记插画；user=主人画像；free=随便画的。默认 free。',
      },
      date: {
        type: 'string',
        description: '给日记画时可选，YYYY-MM-DD，默认今天。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          id: { type: 'string', required: true },
          kind: { type: 'string', required: true },
          title: { type: 'string', required: true },
          url: { type: 'string', required: true },
          markdown: { type: 'string', required: true },
          chars: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `画好了：${value.title}（${value.kind}，${value.chars} 字符）\n请把下面这行原样放进回复里：\n${value.markdown}`,
      }],
    },
    execute(args, exec) {
      const kind = KINDS.includes(args.kind) ? args.kind : 'free'
      const svg = sanitizeSvg(args.svg)
      const saved = saveArt({
        svg,
        title: args.title,
        kind,
        date: args.date,
        session: exec?.agent?.id || '',
      })
      log('画了一张', saved.id, saved.kind, saved.title)
      return {
        ok: true,
        id: saved.id,
        kind: saved.kind,
        title: saved.title,
        url: saved.url,
        markdown: saved.markdown,
        chars: svg.length,
      }
    },
    presentCall() {
      return { card: 'generic', title: '画画', kind: 'other' }
    },
  }))
}
