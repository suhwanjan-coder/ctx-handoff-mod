// 中文、BOM、CRLF 與字數上限的既有行為。
import { expect } from 'claude-code/testing'
import { parseNotes, renderNotes } from './notes'
import { digestOfRows, parseTail } from './digest'
import { test, actionsReply, ctl, distillNow, NOTES, world } from './test-world'

for (const bom of ['', '\ufeff']) for (const nl of ['\n', '\r\n']) test(`經驗檔解析中文並統一成 LF：BOM=${!!bom} CRLF=${nl.length === 2}`, () => {
  const raw = bom + ['# ctx-handoff 專案經驗', '', '## 記憶', '- [project] 中文😀，全形。', '', '## 規則', ''].join(nl)
  const n = parseNotes(raw)
  expect(n.memory[0]?.title).toBe('中文😀，全形。')
  const out = renderNotes(n, '2026-10-23 12:00')
  expect(out).not.toMatch(/[\r\ufeff\ufffd]/)
  expect(parseNotes(out)).toEqual(n)
})

test('記憶六十字與規則四十字以 Unicode 字元計數，超過整條拒絕', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  ctl.distillReply = actionsReply(
    { op: 'add_memory', type: 'project', title: `${'中'.repeat(58)}😀。`, evidence: '測試' },
    { op: 'add_memory', type: 'project', title: `${'中'.repeat(59)}😀。`, evidence: '測試' },
    { op: 'add_rule', name: `${'規'.repeat(38)}😀。`, rule: '規則', applies: '情境', not_applies: '例外', evidence: '測試' },
    { op: 'add_rule', name: `${'規'.repeat(39)}😀。`, rule: '規則', applies: '情境', not_applies: '例外', evidence: '測試' },
  )
  await distillNow($)
  const n = parseNotes(w.files.get(NOTES) ?? '')
  expect(n.memory.map(m => m.title)).toEqual([`${'中'.repeat(58)}😀。`])
  expect(n.rules.map(r => r.name)).toEqual([`${'規'.repeat(38)}😀。`])
  expect(JSON.stringify(n)).not.toContain('\ufffd')
})

test('摘要截短與 CRLF JSONL 不破壞代理對', () => {
  const d = digestOfRows([{ role: 'user', text: `${'中'.repeat(78)}😀尾長`, toolUses: [] },
    { role: 'assistant', text: `${'中'.repeat(98)}😀尾長`, toolUses: [{ tool: 'Read', input: { path: `${'中'.repeat(38)}😀尾\r\n長` } }] }])
  expect(d.task).toBe(`${'中'.repeat(78)}😀…`)
  expect(d.reply).toBe(`${'中'.repeat(98)}😀…`)
  expect(d.tools).toEqual([`Read(${'中'.repeat(38)}😀…)`])
  expect(parseTail('{"type":"user","message":{"content":"中文😀"}}\r\n', false).length).toBe(1)
})
