// 冒烟测试：在真实 DSH 运行时（Electron asar 感知）里加载预设插件，
// 用假 ctx 收集注册结果，验证 defineTool 解析与工具 schema 形态。
import { pathToFileURL } from 'node:url'

const root = pathToFileURL('D:/Code/dsh-yyz-kaka/').href

const registered = []
const sections = []
const variables = []

function makeCtx() {
  return {
    tools: {
      register(definition) {
        registered.push(definition)
        return () => {}
      },
    },
    systemPrompt: {
      variable(name, provider) {
        variables.push(name)
        return () => {}
      },
      section(section) {
        sections.push(section)
        return () => {}
      },
    },
  }
}

const memory = await import(root + 'preset/kaka-memory.mjs')
const voice = await import(root + 'preset/kaka-voice.mjs')

await memory.apply(makeCtx())
await voice.apply(makeCtx())

console.log('sections:', sections.map(s => `${s.name}@${s.order}`).join(', '))
console.log('variables:', variables.join(', '))
console.log('tools:', registered.map(d => d.name).join(', '))
for (const def of registered) {
  const required = def.parameters?.required || []
  console.log(`- ${def.name}: props=${Object.keys(def.parameters?.properties || {}).join('|')} required=${required.join('|')}`)
}
const sample = registered.find(d => d.name === 'kaka_say')
if (sample) {
  console.log('kaka_say output schema:', JSON.stringify(sample.output?.schema)?.slice(0, 200))
  const rendered = sample.output?.render({}, { cached: true, billedChars: 0, spoken: '咔嚓', audioUrl: '/kaka/audio/x.wav' })
  console.log('render sample:', JSON.stringify(rendered))
  const value = await sample.execute({ text: '  ' }, { signal: undefined, agent: undefined })
    .then(() => 'unexpected-ok').catch(err => 'expected-error: ' + err.message)
  console.log('empty text ->', value)
}
console.log('SMOKE OK')
