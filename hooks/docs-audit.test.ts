// 文件審查的行為證據：使用既有模擬世界，不改產品實作。
import { expect, test } from 'claude-code/testing'
import { pickLang, setLang, t } from './i18n'
import { cmd, ctl, distillNow, endTurn, startSession, world } from './test-world'
import { SETTINGS, resolveConfig, thresholdOf, resetConfig } from './config'
import { guardHits } from './guards'

test('文件審查：小對話停用背景整理後仍可手動整理，沒有新回合才略過', async ($, on) => {
  const w = world(on, 1000, 1_000_000, {}, [], 1)
  await cmd($, 'distill off')
  await endTurn($)
  await w.clock.advance(55 * 60_000)
  expect(w.completes).toHaveLength(0)
  await distillNow($)
  expect(w.completes).toHaveLength(1)
  await distillNow($)
  expect(w.completes).toHaveLength(1)
})

for (const off of [false, true]) test(`文件審查：狀態三行與別名（關閉=${off}）`, async ($, on) => {
  world(on, 1000)
  ctl.pluginOptions = { card: !off, command_guard: !off }
  const plain = (await cmd($, '')).text
  expect((await cmd($, 'status')).text).toBe(plain)
  expect((await cmd($, '狀態')).text).toBe(plain)
  expect(plain).toContain('快取 TTL：不明')
  expect(plain).toContain(off ? '狀態卡：關' : '狀態卡：還沒產生')
  expect(plain).toContain(`不可逆指令確認：${off ? 'off' : 'on'}`)
})

test('文件審查：無畫面的排程回合先放行，不走互動拒絕', async ($, on) => {
  const w = world(on, 1000)
  await startSession($)
  ctl.surfaces = []
  await $.prompt.submit({ text: '排程', origin: { kind: 'scheduled-trigger' }, wait: false } as never)
  const r = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  expect(r.deny).toBeUndefined()
  expect(w.asks).toHaveLength(0)
})

test('文件審查：所有翻譯葉節點的鍵與型別相同，設定動態鍵完整', () => {
  const leaves = (o: unknown, prefix = ''): string[] => {
    if (Array.isArray(o)) return o.flatMap((v, i) => leaves(v, `${prefix}.${i}`))
    if (o !== null && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => leaves(v, `${prefix}.${k}`))
    return [`${prefix}:${typeof o}`]
  }
  setLang('zh-TW')
  const zh = leaves(t()).sort()
  setLang('en')
  expect(leaves(t()).sort()).toEqual(zh)
  for (const lang of ['zh-TW', 'en'] as const) {
    setLang(lang)
    for (const key of [...SETTINGS.map(s => s.key), 'refresh', 'distill']) {
      expect(t().panel.settingName[key]).toBeTruthy()
      expect(t().panel.settingHelp[key]).toBeTruthy()
    }
  }
  setLang('zh-TW')
})

test('文件審查：中文介面、自由模型名稱與 700k 視窗門檻', () => {
  expect(pickLang('中文', 'en-US')).toBe('zh-TW')
  expect(pickLang('Chinese', 'en-US')).toBe('zh-TW')
  expect(pickLang(undefined, 'en-US')).toBe('en')
  expect(resolveConfig({ notes_model: 'custom-model', card_model: 'custom-card' }).notesModel).toBe('custom-model')
  resetConfig()
  expect(thresholdOf(700_000)).toBe(560_000)
})

test('文件審查：守門只比本次參數，前置檢查必須寫在同一指令', () => {
  const g = { tool: 'Bash', match: 'git\\s+push', unless: 'preflight' }
  expect(guardHits(g, 'Bash', 'preflight && git push')).toBe(false)
  expect(guardHits(g, 'Bash', 'git push')).toBe(true)
})
