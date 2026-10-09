// 壓縮（session.compact）：記前後 token 數、toast、重設閒置計時，壓縮後還讀到舊數字時不拿它判斷交接
import { expect, test } from 'claude-code/testing'
import { ctl, endTurn, stop, world } from './test-world'

// 壓縮留下的訊息（至少一則）
const KEPT = [{ role: 'user' as const, text: '摘要', toolUses: [] }]
const compact = ($: Parameters<typeof endTurn>[0], trigger: 'manual' | 'auto' | 'plugin' | 'precompute' = 'manual', agentId?: string) =>
  $.session.compact({ trigger, messages: KEPT, ...(agentId ? { agentId } : {}) })

test('壓縮：toast「已壓縮 214k → 31k」並記一行紀錄', async ($, on) => {
  const w = world(on, 100_000)
  on('session.compact', () => ({ messages: KEPT, tokensBefore: 214_000, tokensAfter: 31_000 }))
  await compact($)
  expect(w.toasts.map(x => JSON.parse(x).text)).toContain('已壓縮 214k → 31k')
  expect(w.logs.some(l => l.includes('對話已壓縮：214k → 31k'))).toBe(true)
})

test('壓縮：閒置計時從壓縮那一刻重新算', async ($, on) => {
  const w = world(on, 100_000)
  on('session.compact', () => ({ messages: KEPT, tokensBefore: 214_000, tokensAfter: 31_000 }))
  await endTurn($)
  await w.clock.advance(50 * 60_000)
  await compact($)
  // 原本的計時會在第 55 分鐘響；重設後要等到第 105 分鐘
  await w.clock.advance(10 * 60_000)
  expect(w.forks).toEqual([])
  await w.clock.advance(45 * 60_000)
  expect(w.forks).toEqual(['只回覆 OK'])
})

test('壓縮：引擎沒記壓縮後的大小時，讀數比壓縮前小才當作壓縮後；否則只寫壓縮前', async ($, on) => {
  const w = world(on, 100_000)
  on('session.compact', () => ({ messages: KEPT, tokensBefore: 214_000 }))
  ctl.usage = { tokens: 40_000 }
  await compact($)
  expect(w.toasts.map(x => JSON.parse(x).text).at(-1)).toBe('已壓縮 214k → 40k')
  ctl.usage = { tokens: 214_000 }
  await compact($)
  expect(w.toasts.map(x => JSON.parse(x).text).at(-1)).toBe('已壓縮 214k')
})

test('壓縮：precompute、子代理自己的壓縮、被別的 hook 否決的都不算', async ($, on) => {
  const w = world(on, 100_000)
  let skip = false
  on('session.compact', () => (skip ? { skip: 'off' } : { messages: KEPT, tokensBefore: 214_000, tokensAfter: 31_000 }))
  await compact($, 'precompute')
  await compact($, 'auto', 'agent-1')
  expect(w.toasts).toEqual([])
  skip = true
  await compact($)
  expect(w.toasts).toEqual([])
})

test('壓縮後讀數還是壓縮前的：Stop 不拿它判斷交接；讀數降下來之後又長到門檻才交接', async ($, on) => {
  const w = world(on, 650_000)
  on('session.compact', () => ({ messages: KEPT, tokensBefore: 650_000, tokensAfter: 90_000 }))
  await compact($)
  // 讀數還是 650k（下一次回應才更新）：略過
  await stop($)
  await w.clock.advance(0)
  expect(w.commands).toEqual([])
  expect(w.forks).toEqual([])
  expect(w.logs.some(l => l.includes('還是壓縮前的 650000'))).toBe(true)
  // 讀數更新成壓縮後的：不到門檻，同時解除略過
  ctl.usage = { tokens: 100_000 }
  await stop($)
  await w.clock.advance(0)
  expect(w.commands).toEqual([])
  // 之後真的長回門檻：照常交接
  ctl.usage = { tokens: 650_000 }
  await stop($)
  await w.clock.advance(0)
  expect(w.commands).toEqual(['clear'])
})

test('壓縮後讀數一直不更新：最多略過 3 次，之後照讀數判斷', async ($, on) => {
  const w = world(on, 650_000)
  on('session.compact', () => ({ messages: KEPT, tokensBefore: 650_000, tokensAfter: 90_000 }))
  await compact($)
  for (let i = 0; i < 3; i++) {
    await stop($)
    await w.clock.advance(0)
    expect(w.commands).toEqual([])
  }
  await stop($)
  await w.clock.advance(0)
  expect(w.commands).toEqual(['clear'])
})

test('沒有壓縮過：讀數到門檻照常交接（略過只在壓縮之後）', async ($, on) => {
  const w = world(on, 650_000)
  await stop($)
  await w.clock.advance(0)
  expect(w.commands).toEqual(['clear'])
})
