// node --test tools/：plugin.json 的 userConfig 要和 hooks/config.ts 的 SETTINGS 一致（鍵、型別、預設值、範圍、選項），版本和 CHANGELOG 對得上。
// 測試檔不能 import node:fs，所以這項檢查放在 tools/；config.ts 沒有副檔名的 import，node 讀不進來，改用文字解析 SETTINGS 那幾行
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'))
const source = readFileSync(join(root, 'hooks', 'config.ts'), 'utf8')

const num = s => Number(s.replace(/_/g, ''))
// SETTINGS 的每一行：{ key: '…', kind: '…', … d: … }
function readSettings() {
  const block = source.slice(source.indexOf('export const SETTINGS'), source.indexOf('export const specOf'))
  const out = []
  for (const line of block.split('\n')) {
    const m = /\{ key: '(\w+)', kind: '(num|bool|choice)'(.*)\}/.exec(line)
    if (!m) continue
    const [, key, kind, rest] = m
    const d = /\bd: ('[^']*'|[\w.]+)/.exec(rest)?.[1]
    const entry = { key, kind, d: d.startsWith("'") ? d.slice(1, -1) : d === 'true' ? true : d === 'false' ? false : num(d) }
    if (kind === 'num') { entry.min = num(/min: ([\d_.]+)/.exec(rest)[1]); entry.max = num(/max: ([\d_.]+)/.exec(rest)[1]) }
    if (kind === 'choice') {
      const list = /options: \[([^\]]*)\]/.exec(rest)?.[1]
      // reply_language 的選項在 lang.ts（REPLY_LANG_SETTINGS），config.ts 只引用它
      entry.options = list ? [...list.matchAll(/'([^']*)'/g)].map(x => x[1]) : readReplyLangs()
    }
    out.push(entry)
  }
  return out
}
function readReplyLangs() {
  const lang = readFileSync(join(root, 'hooks', 'lang.ts'), 'utf8')
  const list = /REPLY_LANG_SETTINGS: readonly ReplyLangSetting\[\] = \[([^\]]*)\]/.exec(lang)[1]
  return [...list.matchAll(/'([^']*)'/g)].map(x => x[1])
}

test('userConfig 宣告每一個設定，沒有多的，順序不限', () => {
  const settings = readSettings()
  assert.ok(settings.length >= 16, `只讀到 ${settings.length} 個設定，解析可能壞了`)
  assert.deepEqual(Object.keys(manifest.userConfig).sort(), settings.map(s => s.key).sort())
})

test('userConfig 的型別、預設值、範圍和選項跟 SETTINGS 一致', () => {
  for (const s of readSettings()) {
    const d = manifest.userConfig[s.key]
    assert.ok(d, `${s.key} 沒有宣告`)
    assert.equal(d.type, s.kind === 'num' ? 'number' : s.kind === 'bool' ? 'boolean' : 'string', `${s.key} 型別`)
    assert.equal(d.default, s.d, `${s.key} 預設值`)
    assert.ok(d.title && d.description, `${s.key} 缺標題或說明`)
    if (s.kind === 'num') assert.deepEqual([d.min, d.max], [s.min, s.max], `${s.key} 範圍`)
    // card_model 是自由文字（空字串＝跟 notes_model 一樣），plugin.json 不列選項
    if (s.kind === 'choice' && s.key !== 'card_model') assert.deepEqual([...d.options].sort(), [...s.options].sort(), `${s.key} 選項`)
    if (d.options) assert.ok(d.options.includes(d.default), `${s.key} 的預設值要在選項裡`)
  }
})

test('版本是 0.6.0，CHANGELOG 兩份都有這一版', () => {
  assert.equal(manifest.version, '0.6.0')
  for (const f of ['CHANGELOG.md', 'CHANGELOG.zh-TW.md']) assert.match(readFileSync(join(root, f), 'utf8'), /## \[0\.6\.0\]/, f)
})
