import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const file = process.argv[2]
const raw = readFileSync(file)
const M = [0x28, 0xb5, 0x2f, 0xfd]
const starts = []
for (let i = 0; i + 3 < raw.length; i += 1) {
  if (raw[i] === M[0] && raw[i + 1] === M[1] && raw[i + 2] === M[2] && raw[i + 3] === M[3]) starts.push(i)
}
const parts = []
for (let k = 0; k < starts.length; k += 1) {
  let ok = false
  for (let e = k + 1; e <= starts.length; e += 1) {
    const stop = e < starts.length ? starts[e] : raw.length
    try {
      parts.push(zstdDecompressSync(raw.subarray(starts[k], stop)).toString('utf8'))
      k = e - 1
      ok = true
      break
    } catch { /* try longer frame */ }
  }
  if (!ok) break
}
const lines = parts.join('').split('\n').filter(Boolean)
const events = []
for (const line of lines) {
  try { events.push(JSON.parse(line)) } catch { /* skip */ }
}
console.log('events:', events.length)

// 1) kaka_draw 的调用与结果
for (const ev of events) {
  const s = JSON.stringify(ev)
  if (!/kaka_draw/.test(s)) continue
  const kind = ev.type || ev.kind || Object.keys(ev).join(',')
  console.log('\n--- event', JSON.stringify(kind))
  console.log(s.slice(0, 1200))
}

// 2) 助手消息里的图片 markdown
let count = 0
for (const ev of events) {
  const s = JSON.stringify(ev)
  if (!/!\[[^\]]*\]\(/.test(s)) continue
  const m = s.match(/!\[[^\]]*\]\(([^)]*)\)/g)
  if (!m) continue
  count += 1
  console.log('\n=== assistant image markdown:', JSON.stringify(m))
}
if (count === 0) console.log('\n（没有找到任何图片 markdown）')
