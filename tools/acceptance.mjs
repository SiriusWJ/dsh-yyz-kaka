/**
 * 一键验收：在真实运行的 DSH 里把咔咔跑一遍。
 *
 * 它做四件事：
 *   1. 确保「咔咔的家」会话存在（宿主会按 kaka 预设创建）；
 *   2. 戳她一下，让她回一句话（验证人格 + 工具作用域）；
 *   3. 手动触发一次「写日记 → 做梦」（验证生命周期与记忆整理）；
 *   4. 打印每一步的宿主响应，供人工核对。
 *
 * 前置：DSH 正在运行（默认 http://127.0.0.1:49193，可用参数覆盖）。
 * 用法：node tools/acceptance.mjs [baseUrl]
 */

const base = (process.argv[2] || process.env.KAKA_BASE || 'http://127.0.0.1:49193').replace(/\/$/, '')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function call(path, body) {
  const options = body === undefined
    ? { headers: { accept: 'application/json' } }
    : {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  const response = await fetch(base + path, options)
  const text = await response.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { status: response.status, json }
}

function step(title, value) {
  console.log(`\n=== ${title} ===`)
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

async function main() {
  console.log('目标宿主:', base)

  const health = await call('/kaka/profile')
  step('0. 宿主可达', { status: health.status, ok: health.json.ok, voiceAvailable: health.json.voiceAvailable })
  if (!health.json.ok) {
    console.error('宿主没有响应 /kaka/profile，先确认 DSH 在运行、插件已启用')
    process.exitCode = 1
    return
  }

  const home = await call('/kaka/home', {})
  step('1. 咔咔的家', home.json)
  const sessionId = home.json.sessionId
  if (!sessionId) {
    console.error('没能创建会话，后面的步骤跳过')
    process.exitCode = 1
    return
  }

  const poke = await call('/kaka/poke', { sessionId })
  step('2. 戳她一下', poke.json)

  console.log('\n等待她回应（最多 90 秒）…')
  for (let i = 0; i < 30; i += 1) {
    await sleep(3000)
    const state = await call('/kaka/life/state')
    if (state.json && state.json.mood) {
      process.stdout.write(`  mood=${state.json.mood.name} phase=${state.json.phase}\r`)
    }
    if (i === 8) break
  }

  const diary = await call('/kaka/life/force', { kind: 'diary' })
  step('3. 强制写日记', diary.json)

  console.log('\n等她写日记（30 秒）…')
  await sleep(30000)

  const dream = await call('/kaka/life/force', { kind: 'dream' })
  step('4. 强制做梦', dream.json)

  console.log('\n等她做梦（45 秒）…')
  await sleep(45000)

  const after = await call('/kaka/profile')
  step('5. 事后状态', {
    phase: after.json.life?.phase,
    billing: after.json.billing,
    audio: after.json.audio,
  })

  console.log('\n下一步：node tools/inspect-session.mjs <咔咔的家会话目录> 核对工具与人格。')
}

main().catch(err => {
  console.error('验收脚本失败:', err)
  process.exitCode = 1
})
