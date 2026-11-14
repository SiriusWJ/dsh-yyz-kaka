/**
 * 运行时单元测试（node:test）。
 *
 * 用临时目录当 DSH_HOME，绝不碰真实的 ~/.dsh/kaka。
 * 运行：node --test tests/
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after, before } from 'node:test'

const home = mkdtempSync(join(tmpdir(), 'kaka-test-'))
process.env.DSH_HOME = home

const runtime = await import('../lib/runtime.js')

after(() => {
  try { rmSync(home, { recursive: true, force: true }) } catch { /* ignore */ }
})

before(() => {
  runtime.ensureDirs()
})

test('billedChars：汉字算 2、ASCII 算 1', () => {
  assert.equal(runtime.billedChars('咔咔'), 4)
  assert.equal(runtime.billedChars('ab'), 2)
  assert.equal(runtime.billedChars('咔嚓!'), 5)
})

test('stripForSpeech：去掉代码块、链接、标题符号', () => {
  const input = [
    '## 标题',
    '好的，这是结果：',
    '```js',
    'console.log(1)',
    '```',
    '详见 [文档](https://example.com) 与 `inline`。',
  ].join('\n')
  const out = runtime.stripForSpeech(input)
  assert.ok(!out.includes('```'))
  assert.ok(!out.includes('console.log'))
  assert.ok(!out.includes('https://'))
  assert.ok(out.includes('这是结果'))
  assert.ok(out.includes('文档'))
})

test('firstSentenceWithin：不超上限且尽量凑整句', () => {
  const text = '第一句话很短。第二句话也不长。第三句开始变得非常非常长以至于不可能一次念完。'
  const out = runtime.firstSentenceWithin(text, 20)
  assert.ok(runtime.billedChars(out) <= 20, `billed=${runtime.billedChars(out)}`)
  assert.ok(out.length > 0)
})

test('记忆：写入、读取、渲染与摘要稳定', () => {
  runtime.writeMemory('agent', '# 长记忆\n- [决策] 用 deepseek-flash\n')
  runtime.writeMemory('user', '# 画像\n- 称呼：主人\n')

  const block = runtime.renderMemoryBlock()
  assert.ok(block.includes('用 deepseek-flash'))
  assert.ok(block.includes('称呼：主人'))

  const digest1 = runtime.memoryDigest()
  assert.equal(digest1, runtime.memoryDigest(), '同样的内容摘要必须一致')

  runtime.appendMemory('agent', '- [偏好] 喜欢白茶')
  const digest2 = runtime.memoryDigest()
  assert.notEqual(digest1, digest2, '内容变了摘要必须变')
  assert.ok(runtime.readMemory('agent').includes('喜欢白茶'))
})

test('渲染结果为空时返回空串（用于丢弃空章节）', () => {
  runtime.writeMemory('agent', '')
  runtime.writeMemory('user', '')
  assert.equal(runtime.renderMemoryBlock(), '')
})

test('日记：流水插在手记之前，手记追加在最后', () => {
  runtime.appendDiaryFlow('14:32 · 测试一轮')
  runtime.appendDiaryNote('今天主人让我造的插件跑起来了。')
  const text = runtime.readDiary()
  const flowAt = text.indexOf('14:32')
  const handAt = text.indexOf('## 手记')
  assert.ok(flowAt > 0, '流水要写进去')
  assert.ok(handAt > flowAt, '手记标题必须在流水之后')
  assert.ok(text.indexOf('跑起来了') > handAt, '手记内容在手记标题之后')
})

test('梦：写入后能被读到，且可以列出', () => {
  runtime.writeDream('# 梦\n\n我梦到把主人的插件摊在壳上晒太阳。\n')
  const dream = runtime.readDream()
  assert.ok(dream.includes('晒太阳'))
  const list = runtime.recentDreams(3)
  assert.equal(list.length, 1)
  assert.ok(list[0].text.includes('晒太阳'))
})

test('事件表：安排、到期、取出后清空', () => {
  runtime.scheduleEvent('reminder', Date.now() - 1000, { what: '喝水' }, 'test-reminder')
  const due = runtime.takeDueEvents()
  assert.equal(due.length, 1)
  assert.equal(due[0].payload.what, '喝水')
  assert.equal(runtime.takeDueEvents().length, 0, '取过的必须被摘掉')
})

test('设置：补丁合并并夹紧数值', () => {
  const next = runtime.patchSettings({ pet: { size: 999 }, voice: { volume: 9 } })
  assert.equal(next.pet.size, 160, '尺寸要被夹到上限')
  assert.equal(next.voice.volume, 1, '音量要被夹到 1')
  const settings = runtime.getSettings()
  assert.equal(settings.notify.level, 'important', '未提供的字段保持默认')
})

test('作息窗口：解析与判定', () => {
  const at = hour => {
    const d = new Date()
    d.setHours(hour, 30, 0, 0)
    return d
  }
  runtime.patchSettings({ life: { windowStart: '00:00', windowEnd: '08:00' } })
  assert.equal(runtime.inQuietWindow(at(3)), true)
  assert.equal(runtime.inQuietWindow(at(12)), false)

  // 跨午夜窗口
  runtime.patchSettings({ life: { windowStart: '23:00', windowEnd: '06:00' } })
  assert.equal(runtime.inQuietWindow(at(23)), true)
  assert.equal(runtime.inQuietWindow(at(2)), true)
  assert.equal(runtime.inQuietWindow(at(8)), false)
})

test('quietDue：窗口外 / 已写过 / 静默足够 / 仍在活动', () => {
  const at = hour => {
    const d = new Date()
    d.setHours(hour, 0, 0, 0)
    return d
  }
  runtime.patchSettings({
    life: { enabled: true, diary: true, windowStart: '00:00', windowEnd: '08:00', idleHours: 3 },
  })
  const state = runtime.getState()

  // 窗口外
  assert.equal(runtime.quietDue(at(12)).reason, 'outside-window')

  // 今天已经写过
  state.lastDiaryDate = runtime.dateKey()
  state.lastHumanActivity = Date.now() - 5 * 3600_000
  runtime.saveState()
  assert.equal(runtime.quietDue(at(3)).reason, 'already-diary')

  // 静默超过阈值 → 该写日记
  state.lastDiaryDate = ''
  state.lastHumanActivity = Date.now() - 4 * 3600_000
  state.lastKakaActivity = 0
  runtime.saveState()
  assert.equal(runtime.quietDue(at(3)).due, true)

  // 主人刚动过 → 不写
  state.lastHumanActivity = Date.now()
  runtime.saveState()
  assert.equal(runtime.quietDue(at(3)).reason, 'still-active')
})

test('msUntilWindowEnd：返回正的剩余毫秒', () => {
  runtime.patchSettings({ life: { windowStart: '00:00', windowEnd: '23:59' } })
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const ms = runtime.msUntilWindowEnd(now)
  assert.ok(ms > 0 && ms < 24 * 3600_000, `ms=${ms}`)
})

test('pickRamble：总是从文案池里挑一条非空的话', () => {
  for (let i = 0; i < 20; i += 1) {
    const line = runtime.pickRamble()
    assert.equal(typeof line, 'string')
    assert.ok(line.length > 0)
  }
})

test('发件箱：序号递增，可增量取', () => {
  const before = runtime.outboxCursor()
  const entry = runtime.beep('done')
  assert.equal(entry.seq, before + 1)
  const items = runtime.outboxSince(before)
  assert.equal(items.length, 1)
  assert.equal(items[0].kind, 'beep')
})

test('心情：未知值回落到 idle', () => {
  const mood = runtime.setMood('咆哮', '')
  assert.equal(mood.name, 'idle')
})

test('清理：音频缓存与记忆可清空', () => {
  runtime.clearAudioCache()
  assert.deepEqual(runtime.audioCacheStats().files, 0)
  runtime.appendMemory('user', '- 临时')
  runtime.clearMemory()
  assert.ok(runtime.readMemory('user').includes('主人画像'))
})
