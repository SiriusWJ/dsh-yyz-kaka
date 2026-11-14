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
    try { parts.push(zstdDecompressSync(raw.subarray(starts[k], stop)).toString('utf8')); k = e - 1; ok = true; break } catch {}
  }
  if (!ok) break
}
const events = []
for (const line of parts.join('').split('\n')) {
  if (!line.trim()) continue
  try { events.push(JSON.parse(line)) } catch {}
}

const byTurn = new Map()
for (const ev of events) {
  const turn = ev?.data?.turn ?? (ev?.data?.message?.turn)
  if (typeof turn !== 'number') continue
  if (!byTurn.has(turn)) byTurn.set(turn, [])
  byTurn.get(turn).push(ev)
}

for (const turn of [...byTurn.keys()].sort((a, b) => a - b)) {
  const evs = byTurn.get(turn)
  const calls = evs.filter(e => e.type === 'tool/call' && /kaka_draw/.test(JSON.stringify(e.data)))
  if (calls.length === 0) continue
  console.log(`\n================ turn ${turn} ================`)
  for (const call of calls) {
    console.log('[call] title =', JSON.parse(call.data.arguments).title)
  }
  // 工具结果：同一 turn 里 role=tool 且 content 里含 "画好了"
  for (const ev of evs) {
    const s = JSON.stringify(ev)
    if (!/"画好了/.test(s)) continue
    try {
      const content = ev.data.message.content
      for (const block of content) {
        if (block.type === 'text') console.log('[tool result]\n' + block.text.slice(0, 400))
      }
    } catch {}
  }
  // 她的回复正文
  for (const ev of evs) {
    if (ev.type !== 'assistant/message') continue
    const content = ev.data?.message?.content || []
    const texts = content.filter(b => b.type === 'text' && b.text.trim()).map(b => b.text)
    for (const text of texts) {
      if (!/画|图/.test(text)) continue
      console.log('[assistant text]\n' + text.slice(0, 600))
    }
  }
}
