// 0.6.0 的精簡：經驗檔的內容預設不帶進對話（inject_notes 關），「放進專案」整個拿掉（plugin.json 的 userConfig 和設定一致由 tools/manifest.test.mjs 檢查）
import { expect } from 'claude-code/testing'
import { resolveConfig } from './config'
import { test, actionsReply, BAND_MOUNT, cmd, ctl, distillNow, EXISTING, NOTES, openPanel, pushGuard, say, startSession, stop, world } from './test-world'

const RULES_5 = [
  '# ctx-handoff 專案經驗', '', '## 記憶', '- [feedback] 使用者要求每次都先跑測試', '', '## 規則', '',
  '### 推送前先跑 preflight（5 次）', '- 規則：先跑 preflight', '',
  '## 流程', '', '### 發版（5 次）', '- 時機：要發新版本時', '- 步驟：', '  1. 改版本號', '  2. 打 tag', '  3. 建立 release', '',
].join('\n')
const blocks = async ($: Parameters<typeof cmd>[0]) => (await $.prompt.context({ blocks: [] })).blocks

// ---------- R1：inject_notes ----------

test('設定預設：inject_notes 關、card 開、card_model 空、command_guard 開', () => {
  const c = resolveConfig({})
  expect(c).toMatchObject({ injectNotes: false, card: true, cardModel: '', commandGuard: true })
  expect(resolveConfig({ inject_notes: true, card: false, card_model: ' claude-opus-5-5 ', command_guard: false })).toMatchObject({ injectNotes: true, card: false, cardModel: 'claude-opus-5-5', commandGuard: false })
  // 型別不對用預設
  expect(resolveConfig({ inject_notes: 'yes', card: 1, command_guard: 'off' })).toMatchObject({ injectNotes: false, card: true, commandGuard: true })
})

test('inject_notes 預設關：新對話開頭不帶經驗檔的任何內容，進度備忘照常', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, { 'progress:C--proj': { sid: 'S0', at: 0, task: '搬資料庫設定', state: 'blocked', next: '等連線字串', files: [] } }, [], 5)
  ctl.pluginOptions = {}
  w.files.set(NOTES, RULES_5)
  const names = (await blocks($)).map(b => b.name)
  expect(names).toEqual(['ctxHandoffProgress'])
  expect(JSON.stringify(await blocks($))).not.toContain('先跑 preflight')
})

test('inject_notes 關：背景整理照常跑、照常寫經驗檔，但不排入差異，下一則訊息沒有經驗內容，toast 不說會帶入', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  ctl.pluginOptions = {}
  await distillNow($)
  const notes = w.files.get(NOTES) ?? ''
  expect(notes).toContain('使用者決定交接門檻維持 600k')
  expect(notes).toContain('### 先實測再下結論（1 次）')
  const lastToast = w.toasts.map(x => JSON.parse(x).text as string).find(x => x.includes('經驗已更新'))
  expect(lastToast).toContain('經驗已更新 2 項')
  expect(lastToast).not.toContain('帶入')
  await say($, '下一則訊息')
  expect(w.contexts[0]).toBeUndefined()
  expect((await cmd($, '')).text).toContain('不帶入新對話：inject_notes 已關')
  expect((await cmd($, '')).text).not.toContain('記憶帶入：')
})

test('inject_notes 開：開頭帶入經驗，整理的差異跟著下一則訊息', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  ctl.pluginOptions = { inject_notes: true }
  w.files.set(NOTES, RULES_5)
  const text = (await blocks($)).find(b => b.name === 'ctxHandoffProject')?.text ?? ''
  expect(text).toContain('使用者要求每次都先跑測試')
  expect(text).toContain('推送前先跑 preflight（5 次）')
  await distillNow($)
  await say($, '下一則訊息')
  expect(w.contexts[0]?.[0]).toContain('新增記憶')
  expect((await cmd($, '')).text).toContain('帶入新對話的規則 1 條')
})

test('面板設定：經驗帶入新對話預設關，按切換後馬上生效', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  ctl.pluginOptions = {}
  w.files.set(NOTES, EXISTING)
  const ui = await openPanel($)
  await ui.press({ key: 'tab:settings' })
  expect(await ui.find({ type: 'Text', text: /經驗帶入新對話 關 預設/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /狀態卡用的模型 同整理用 預設/ })).toBeDefined()
  expect(await blocks($)).toEqual([])
  await ui.press({ key: 'set:inject_notes' })
  expect(w.get('settings')).toEqual({ inject_notes: true })
  expect((await blocks($)).map(b => b.name)).toEqual(['ctxHandoffProject'])
})

// ---------- R2：放進專案整個拿掉 ----------

test('放進專案已拿掉：不註冊工具、新對話開頭沒有交代、不寫任何專案檔案，也沒有 promote 紀錄', async ($, on) => {
  const w = world(on, 650_000, 1_000_000, { 'guards:C--proj': [pushGuard('on')] }, [], 5)
  ctl.pluginOptions = { inject_notes: true }
  w.files.set('C:/proj/.git', '')
  w.files.set(NOTES, RULES_5)
  await startSession($)
  expect(w.tools).toEqual([])
  const names = (await blocks($)).map(b => b.name)
  expect(names).toEqual(['ctxHandoffProject'])
  expect(names).not.toContain('ctxHandoffPromote')
  // 跑一輪整理、交接：沒有寫到任何專案檔案
  ctl.distillReply = actionsReply({ op: 'confirm_rule', id: 'R1', evidence: '又出現一次' })
  await stop($)
  await w.clock.advance(0)
  expect(w.commands).toEqual(['clear'])
  expect(w.writes.filter(p => /(?:^|\/)(?:CLAUDE|AGENTS|SKILL)\.md$/.test(p))).toEqual([])
  expect(w.writes.filter(p => !p.includes('/.claude/') && !p.includes('/.ctx-handoff-backup/'))).toEqual([])
  expect(w.get('promote:C--proj')).toBeUndefined()
  // 舊的工具名稱不再被攔截，原樣交給下層
  const r = await $.tool.call({ tool: 'mcp__ctx-handoff__mark_in_project', items: [{ rule: '推送前先跑 preflight', where: 'CLAUDE.md' }] } as never)
  expect(r.result).toBe('ok')
  expect(w.files.get(NOTES)).toContain('### 推送前先跑 preflight（')
  expect(w.files.get(NOTES)).not.toContain('- 專案：')
})

test('放進專案已拿掉：舊經驗檔裡的「- 專案：」行只是一般內容，規則照常帶入、照常算守門候選', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  ctl.pluginOptions = { inject_notes: true }
  const old = RULES_5.replace('- 規則：先跑 preflight', '- 規則：先跑 preflight\n- 專案：已在 CLAUDE.md')
  w.files.set(NOTES, old)
  expect(((await blocks($)).find(b => b.name === 'ctxHandoffProject')?.text) ?? '').toContain('先跑 preflight')
  expect((await cmd($, '')).text).toContain('有 1 條規則出現 3 次以上還沒有守門')
})

test('面板記憶分頁：經驗帶入關著時提示不說會帶入新對話，打開後恢復', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  ctl.pluginOptions = {}
  w.files.set(NOTES, EXISTING)
  const off = await openPanel($, 'memory')
  expect(await off.find({ type: 'Text', text: /目前不帶入新對話/ })).toBeDefined()
  expect(await off.find({ type: 'Text', text: /偏好與修正整條帶入新對話/ })).toBeUndefined()
  await off.unmount()
  ctl.panelSettings = { inject_notes: true }
  await say($, '套用設定')
  // 關了再開，快照重算
  await cmd($, 'panel')
  await cmd($, 'panel')
  const on2 = await $.ui.mount(BAND_MOUNT)
  await on2.press({ key: 'tab:memory' })
  expect(await on2.find({ type: 'Text', text: /偏好與修正整條帶入新對話/ })).toBeDefined()
})
