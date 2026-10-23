// session 摘要（四行，從對話檔尾端算、依修改時間與大小快取）與快取 TTL（5 分鐘的 session 不做保持快取刷新）
import { expect } from 'claude-code/testing'
import { DIGEST_LABELS_ZH, digestLines, digestOf, digestOfRows, parseTail, ttlOf } from './digest'
import { test, cmd, ctl, endTurn, world } from './test-world'

const TRANSCRIPT = 'C:/Users/u/.claude/projects/C--proj/S1.jsonl'
const j = (o: object) => JSON.stringify(o)
const user = (ts: string, content: unknown, extra: object = {}) => j({ type: 'user', timestamp: ts, isSidechain: false, message: { role: 'user', content }, ...extra })
const assistant = (ts: string, content: unknown[], usage?: object, extra: object = {}) =>
  j({ type: 'assistant', timestamp: ts, isSidechain: false, message: { role: 'assistant', content, ...(usage ? { usage } : {}) }, ...extra })
const text = (t: string) => ({ type: 'text', text: t })
const tool = (name: string, input: object) => ({ type: 'tool_use', name, input })
const usage1h = { cache_creation_input_tokens: 500, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 500 } }
const usage5m = { cache_creation_input_tokens: 500, cache_creation: { ephemeral_5m_input_tokens: 500, ephemeral_1h_input_tokens: 0 } }
const usageRead = { cache_creation_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } }

const SAMPLE = [
  user('2026-10-09T10:00:00.000Z', '請修好登入頁的逾時'),
  assistant('2026-10-09T10:01:00.000Z', [text('好，先看程式'), tool('Read', { file_path: 'src/auth/login.ts' })], usage1h),
  user('2026-10-09T10:01:05.000Z', [{ type: 'tool_result', tool_use_id: 'x', content: '檔案內容' }]),
  user('2026-10-09T10:01:06.000Z', '<system-reminder>提醒</system-reminder>', { isMeta: true }),
  assistant('2026-10-09T10:02:00.000Z', [tool('Edit', { file_path: 'src/auth/login.ts' }), tool('Bash', { command: 'npm test' })], usage1h),
  assistant('2026-10-09T10:02:30.000Z', [text('子代理在忙'), tool('Grep', { pattern: 'x' })], usage5m, { isSidechain: true }),
  assistant('2026-10-09T10:03:00.000Z', [tool('Bash', { command: 'git status' }), text('測試通過了，剩補 refresh token 的測試。')], usageRead),
  j({ type: 'system', timestamp: '2026-10-09T10:40:02.190Z', subtype: 'stop_hook_summary' }),
].join('\n')

// ---------- 純函式 ----------

test('尾端解析：從中間切開時丟掉第一行不完整的，壞行略過', () => {
  const cutText = `{"type":"user","message":{"content":"被切掉一半的${'\n'}${user('2026-10-09T10:00:00.000Z', '完整的一行')}\n不是 JSON\n`
  expect(parseTail(cutText, true).length).toBe(1)
  expect(parseTail(cutText, false).length).toBe(1)
  expect(parseTail(`${user('2026-10-09T10:00:00.000Z', 'a')}\n${user('2026-10-09T10:00:01.000Z', 'b')}`, false).length).toBe(2)
})

test('摘要四行：目前工作、最後活動時間（台北）、最近 3 個工具呼叫、最後一句回覆；子代理、工具結果、系統提醒不算', () => {
  const d = digestOf(parseTail(SAMPLE, false))
  expect(d.task).toBe('請修好登入頁的逾時')
  expect(d.lastAt).toBe(Date.parse('2026-10-09T10:40:02.190Z'))
  expect(d.tools).toEqual(['Edit(src/auth/login.ts)', 'Bash(npm test)', 'Bash(git status)'])
  expect(d.reply).toBe('測試通過了，剩補 refresh token 的測試。')
  expect(digestLines(d, DIGEST_LABELS_ZH)).toEqual([
    '目前工作：請修好登入頁的逾時',
    '最後活動時間：2026/10/09 18:40',
    '最近 3 個工具呼叫：Edit(src/auth/login.ts) → Bash(npm test) → Bash(git status)',
    '最後一句回覆：測試通過了，剩補 refresh token 的測試。',
  ])
  // 太長的截短
  const long = digestOf(parseTail(`${user('2026-10-09T10:00:00.000Z', '長'.repeat(300))}\n${assistant('2026-10-09T10:00:01.000Z', [text('答'.repeat(300))])}`, false))
  expect([...long.task].length).toBe(80)
  expect([...long.reply].length).toBe(100)
  // 空的尾端
  expect(digestLines(digestOf([]), DIGEST_LABELS_ZH)).toEqual(['目前工作：無', '最後活動時間：不明', '最近 3 個工具呼叫：無', '最後一句回覆：無'])
})

test('快取 TTL：用最近一筆有寫快取的主對話回覆；兩個欄位都是 0 的往前找；子代理不算；看不出來是 unknown', () => {
  const at = (entries: string[]) => ttlOf(parseTail(entries.join('\n'), false))
  expect(at([assistant('2026-10-09T10:00:00.000Z', [text('a')], usage1h)])).toEqual({ kind: '1h', at: Date.parse('2026-10-09T10:00:00.000Z') })
  expect(at([assistant('2026-10-09T10:00:00.000Z', [text('a')], usage5m)]).kind).toBe('5m')
  // 最新一筆全從快取讀：往前找
  expect(at([assistant('2026-10-09T10:00:00.000Z', [text('a')], usage5m), assistant('2026-10-09T10:01:00.000Z', [text('b')], usageRead)]).kind).toBe('5m')
  // 子代理自己的 5 分鐘不代表主對話
  expect(at([assistant('2026-10-09T10:00:00.000Z', [text('a')], usage1h), assistant('2026-10-09T10:01:00.000Z', [text('b')], usage5m, { isSidechain: true })]).kind).toBe('1h')
  // 同一筆兩種都有：1h
  expect(at([assistant('2026-10-09T10:00:00.000Z', [text('a')], { cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 } })]).kind).toBe('1h')
  expect(at([assistant('2026-10-09T10:00:00.000Z', [text('a')], usageRead)]).kind).toBe('unknown')
  expect(at([assistant('2026-10-09T10:00:00.000Z', [text('a')], { cache_creation_input_tokens: 5 })]).kind).toBe('unknown')
  expect(at([]).kind).toBe('unknown')
})

test('後備：對話檔讀不到時從訊息列湊（沒有時間與 TTL）', () => {
  const d = digestOfRows([
    { role: 'user', text: '第一個要求', toolUses: [] },
    { role: 'assistant', text: '好', toolUses: [{ tool: 'Bash', input: { command: 'ls' } }] },
    { role: 'user', text: '最後的要求', toolUses: [] },
    { role: 'assistant', text: '做完了', toolUses: [{ tool: 'Edit', input: { file_path: 'a.ts' } }] },
  ])
  expect(d).toMatchObject({ task: '最後的要求', reply: '做完了', tools: ['Bash(ls)', 'Edit(a.ts)'], lastAt: undefined, ttl: { kind: 'unknown' } })
})

// ---------- 經由 plugin ----------

const statusLines = async ($: Parameters<typeof cmd>[0]) => (await cmd($, '')).text ?? ''

test('/handoff 狀態顯示 session 摘要四行與 TTL；對話檔沒變就不重讀，變了才重讀', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  w.files.set(TRANSCRIPT, SAMPLE)
  const s1 = await statusLines($)
  expect(s1).toContain('session 摘要：')
  expect(s1).toContain('　目前工作：請修好登入頁的逾時')
  expect(s1).toContain('　最後活動時間：2026/10/09 18:40')
  expect(s1).toContain('　最近 3 個工具呼叫：Edit(src/auth/login.ts) → Bash(npm test) → Bash(git status)')
  expect(s1).toContain('　最後一句回覆：測試通過了，剩補 refresh token 的測試。')
  expect(s1).toContain('快取 TTL：1 小時（最近一次寫快取 2026/10/09 18:02）')
  const readsOf = () => w.reads.filter(p => p === TRANSCRIPT).length
  const before = readsOf()
  expect(before).toBeGreaterThan(0)
  await statusLines($)
  expect(readsOf()).toBe(before)
  // 內容變了（修改時間和大小跟著變）：重讀
  w.files.set(TRANSCRIPT, `${SAMPLE}\n${user('2026-10-09T10:50:00.000Z', '新的要求')}`)
  expect(await statusLines($)).toContain('目前工作：新的要求')
  expect(readsOf()).toBeGreaterThan(before)
})

test('摘要只讀尾端 64 KB：超過 $.fs.read 上限的大對話檔改用 tail 讀尾端，第一行不完整就丟掉', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  const filler = `${user('2026-10-09T09:00:00.000Z', '很久以前的要求')}\n`.repeat(2000)
  w.files.set(TRANSCRIPT, `${filler}${SAMPLE}`)
  ctl.bigFiles.add(TRANSCRIPT)
  const s = await statusLines($)
  expect(w.procs[0]).toEqual(['tail', '-c', String(64 * 1024), TRANSCRIPT])
  expect(w.reads.includes(TRANSCRIPT)).toBe(false)
  expect(s).toContain('目前工作：請修好登入頁的逾時')
  expect(s).toContain('快取 TTL：1 小時')
})

test('對話檔讀不到或沒有內容：摘要退回訊息列，TTL 不明，保持快取刷新照常', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  w.files.delete(TRANSCRIPT)
  w.rows.push({ role: 'user', text: '訊息列裡的要求', toolUses: [] })
  const s = await statusLines($)
  expect(s).toContain('目前工作：訊息列裡的要求')
  expect(s).toContain('最後活動時間：不明')
  expect(s).toContain('快取 TTL：不明')
})

// ---------- B6：TTL 決定要不要做保持快取刷新 ----------

for (const kind of ['1h', '5m', 'unknown'] as const) {
  test(`閒置 55 分鐘（TTL ${kind}）：${kind === '5m' ? '不刷新，直接存離席 handoff，並說明原因' : '照常刷新'}`, async ($, on) => {
    const w = world(on, 100_000)
    w.files.set(TRANSCRIPT, kind === 'unknown' ? '' : [user('2026-10-09T10:00:00.000Z', '做事'), assistant('2026-10-09T10:01:00.000Z', [text('好')], kind === '5m' ? usage5m : usage1h)].join('\n'))
    await endTurn($)
    await w.clock.advance(55 * 60_000)
    if (kind === '5m') {
      expect(w.forks.some(f => f === '只回覆 OK')).toBe(false)
      expect(w.forks.some(f => f.includes('HANDOFF'))).toBe(true)
      expect(w.get('away:S1')).toBeDefined()
      expect(w.logs.some(l => l.includes('只寫 5 分鐘快取'))).toBe(true)
      const s = await statusLines($)
      expect(s).toContain('快取 TTL：5 分鐘')
      expect(s).toContain('保持快取刷新幫不上忙，已略過')
    } else {
      expect(w.forks).toEqual(['只回覆 OK'])
      expect(w.get('away:S1')).toBeUndefined()
      expect(w.logs.some(l => l.includes('只寫 5 分鐘快取'))).toBe(false)
    }
  })
}

test('TTL 是 5 分鐘但保持快取本來就關著：狀態不說「略過」，只說關著', async ($, on) => {
  const w = world(on, 100_000)
  w.files.set(TRANSCRIPT, [user('2026-10-09T10:00:00.000Z', '做事'), assistant('2026-10-09T10:01:00.000Z', [text('好')], usage5m)].join('\n'))
  await cmd($, 'refresh off')
  const s = await statusLines($)
  expect(s).toContain('快取 TTL：5 分鐘（這個 session 只寫 5 分鐘快取，保持快取刷新本來就關著）')
})

test('英文介面：摘要與 TTL 的標籤沒有中文', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5, 'English')
  w.files.set(TRANSCRIPT, [user('2026-10-09T10:00:00.000Z', 'fix it'), assistant('2026-10-09T10:01:00.000Z', [text('done')], usage5m)].join('\n'))
  const lines = (await statusLines($)).split('\n')
  const i = lines.indexOf('Session digest:')
  expect(i).toBeGreaterThan(-1)
  expect(lines.slice(i, i + 6).join('\n')).toBe([
    'Session digest:',
    '  Current work: fix it',
    '  Last activity: 2026/10/09 18:01',
    '  Last 3 tool calls: none',
    '  Last reply: done',
    'Cache TTL: 5 minutes (this session only writes the 5-minute cache, so a keep-warm refresh cannot help and is skipped; an away handoff is saved when idle)',
  ].join('\n'))
})

