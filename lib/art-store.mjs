import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { KAKA_DIR, clockKey, dateKey } from './runtime.js'

/** 咔咔的画都放在这里，和记忆、日记并列。 */
export const ART_DIR = join(KAKA_DIR, 'art')

/** 画作索引：id → 元信息（新的在前）。 */
const ART_INDEX = join(ART_DIR, 'index.json')

function ensureArtDir() {
  if (!existsSync(ART_DIR)) mkdirSync(ART_DIR, { recursive: true })
}

/** 读索引；坏文件当作空列表。 */
export function readArtIndex() {
  try {
    const raw = JSON.parse(readFileSync(ART_INDEX, 'utf8'))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

/** id → 磁盘路径（只允许字母数字与 . _ -）。 */
export function artPath(id) {
  return join(ART_DIR, `${String(id).replace(/[^\w.-]/gu, '_')}.svg`)
}

function withUrl(item) {
  return { ...item, url: `/kaka/art/file?id=${encodeURIComponent(item.id)}` }
}

/**
 * 保存一张画。
 * @param {object} input - { svg, title, kind, date, session }
 * @returns {{id: string, title: string, kind: string, date: string, createdAt: number, url: string, markdown: string}}
 */
export function saveArt(input) {
  ensureArtDir()
  const now = new Date()
  const kind = ['user', 'diary', 'free'].includes(input.kind) ? input.kind : 'free'
  const date = String(input.date || dateKey(now))
  const id = `${dateKey(now)}-${clockKey(now).replace(/:/gu, '')}-${Math.random().toString(36).slice(2, 6)}`
  const file = artPath(id)

  writeFileSync(file, String(input.svg || ''), 'utf8')

  const meta = {
    id,
    title: String(input.title || '无题').slice(0, 60),
    kind,
    date,
    session: String(input.session || ''),
    createdAt: now.getTime(),
  }
  const index = readArtIndex().filter(item => item.id !== id)
  index.unshift(meta)
  writeFileSync(ART_INDEX, JSON.stringify(index.slice(0, 200), null, 2), 'utf8')

  return {
    ...withUrl(meta),
    // 聊天里显示用：Windows 原生绝对路径。实测正斜杠的 `C:/...` 在聊天里渲染不出来，
    // 反斜杠的 `C:\...` 可以（宿主的路径图片解析认的是前者会被当 URL scheme）。
    markdown: `![${meta.title}](${file})`,
    file,
  }
}

/** 按类型列画作（新的在前）。 */
export function listArt(kind) {
  const index = readArtIndex()
  return (kind ? index.filter(item => item.kind === kind) : index)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(withUrl)
}

/** 某一天的日记插画。 */
export function artForDate(date) {
  const day = String(date || dateKey())
  return listArt().filter(item => item.kind === 'diary' && item.date === day)
}

/** 最近一张主人画像。 */
export function latestPortrait() {
  return listArt('user')[0] || null
}

/** 读画作正文；不存在返回 null。 */
export function readArt(id) {
  try {
    return readFileSync(artPath(id), 'utf8')
  } catch {
    return null
  }
}
