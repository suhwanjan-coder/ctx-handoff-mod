import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTestCounts } from './lib.mjs'

// 擷取 Node 24 實跑原有 39 條工具測試的兩種 reporter 摘要。
const tap = "# Subtest: 流程：沒有變動的套用原樣輸出；list 列出流程；刪除流程只動那一條\n# tests 39\n# suites 0\n# pass 39\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1920.6833\n"
const spec = "ℹ tests 39\nℹ suites 0\nℹ pass 39\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 1717.1558\n"

for (const [name, output] of [['TAP', tap], ['spec', spec]]) {
  test(`工具測試計數：${name} 真實摘要`, () => {
    assert.deepEqual(parseTestCounts(output), { pass: '39', fail: '0' })
  })
}

test('工具測試計數：失敗數、換行與缺少欄位', () => {
  for (const prefix of ['#', 'ℹ']) {
    assert.deepEqual(parseTestCounts(`${prefix} pass 37\r\n${prefix} fail 2\r\n`), { pass: '37', fail: '2' })
    assert.deepEqual(parseTestCounts(`${prefix} pass 0\n`), { pass: '0', fail: '?' })
    assert.deepEqual(parseTestCounts(`${prefix} fail 1\n`), { pass: '?', fail: '1' })
  }
  assert.deepEqual(parseTestCounts(''), { pass: '?', fail: '?' })
  assert.deepEqual(parseTestCounts('測試名稱含 # pass 39 與 ℹ fail 0'), { pass: '?', fail: '?' })
})
