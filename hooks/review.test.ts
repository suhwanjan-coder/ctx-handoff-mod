// 獨立審查（0.6.0）找到的缺陷的固定測試。每個測試名稱開頭的 review-N 是審查的第 N 項
import { expect } from 'claude-code/testing'
import { CARD_CLOSE, applyCard, cardFromHandoff, emptyFields, findCard, parseCard, parseCardReply, renderCard } from './card'
import type { CardFields } from './card'
import { digestOf, digestOfRows, parseTail } from './digest'
import { test, cmd, ctl, say, world } from './test-world'

const HANDOFF_FILE = 'C:/proj/_HANDOFF.md'
const BACKUP_DIR = 'C:/proj/.ctx-handoff-backup'
const OPEN_PREFIX = '<!-- ctx-handoff:card rev='
const META = { at: Date.UTC(2026, 9, 9, 10, 40), sid: 'abcdef1234567890', rev: 1 }
const FIELDS: CardFields = { status: '修好登入頁', running: '', waiting: '', next: '補測試', verified: '', failed: [], decisions: [] }
const count = (text: string, part: string) => text.split(part).length - 1
const nowHandoff = async ($: Parameters<typeof cmd>[0], w: ReturnType<typeof world>) => {
  await cmd($, 'now')
  await w.clock.advance(0)
}

// ---------- review-1：欄位值裡的標記文字 ----------

const EVIL: CardFields = {
  ...FIELDS,
  status: '看 <!-- ctx-handoff:card rev=7 --> 這個',
  next: '跑完 <!-- /ctx-handoff:card --> 再說',
  decisions: ['a --> b', '<!-- ctx-handoff:card rev=9 -->', `x ${CARD_CLOSE} y`],
}

test('review-1：欄位值帶標記文字，連續三次重寫仍只有一個開頭、一個結尾標記，標記外逐位元相同', () => {
  let file = '# T\n\n前面手寫\n\n後面手寫  \n'
  for (let rev = 1; rev <= 3; rev++) {
    const out = applyCard(file, renderCard(EVIL, { ...META, rev }))
    if (!('text' in out)) throw new Error('broken')
    file = out.text
    expect(count(file, OPEN_PREFIX)).toBe(1)
    expect(count(file, CARD_CLOSE)).toBe(1)
  }
  const found = findCard(file)
  if (!found || found === 'broken') throw new Error('card missing')
  expect(found.rev).toBe(3)
  expect(file.slice(0, found.start)).toBe('# T\n\n')
  expect(file.slice(found.end)).toBe('\n\n前面手寫\n\n後面手寫  \n')
  // 讀回來的欄位仍是清過的版本，沒有標記文字
  const back = parseCard(found.text)
  expect(back.next).toBe('跑完 ‹!-- /ctx-handoff:card --› 再說')
  expect(back.decisions.join('')).not.toContain('<!--')
  expect(back.decisions.join('')).not.toContain('-->')
})

test('review-1：模型回覆與摘要後備填的值也清過', () => {
  const reply = parseCardReply(JSON.stringify({ status: 'x', next: `a ${CARD_CLOSE} b`, failed: ['--> c'] }), emptyFields())
  expect(reply?.next).not.toContain('<!--')
  expect(reply?.next).not.toContain('-->')
  expect(reply?.failed.join('')).not.toContain('-->')
  const fb = cardFromHandoff(`HANDOFF: 目標 ${CARD_CLOSE}\n8. 下一步：做 <!-- x -->`, emptyFields())
  expect(fb.status).not.toContain('<!--')
  expect(fb.next).not.toContain('-->')
  // renderCard 是最後一道：就算欄位被直接塞了標記文字也寫不出去
  expect(count(renderCard({ ...FIELDS, running: CARD_CLOSE, waiting: `${OPEN_PREFIX}1 -->` }, META), CARD_CLOSE)).toBe(1)
})

test('review-1：經由 plugin，模型回覆帶結尾標記，三次交接後檔案只有一張卡片', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  w.files.set(HANDOFF_FILE, '# 交接\n\n手寫\n')
  ctl.cardReply = JSON.stringify({ status: '好', next: `繼續 ${CARD_CLOSE} 然後`, decisions: ['x --> y'] })
  for (let i = 0; i < 3; i++) await nowHandoff($, w)
  const text = w.files.get(HANDOFF_FILE) ?? ''
  expect(count(text, OPEN_PREFIX)).toBe(1)
  expect(count(text, CARD_CLOSE)).toBe(1)
  expect(text.startsWith('# 交接\n\n')).toBe(true)
  expect(text.endsWith('\n\n手寫\n')).toBe(true)
})

// ---------- review-2：不是 UTF-8 的檔案 ----------

const NON_UTF8: [string, number[]][] = [
  ['UTF-16LE 加 BOM', [0xff, 0xfe, 0x23, 0x00, 0x20, 0x00, 0x2d, 0x4e]],
  ['UTF-16BE 加 BOM', [0xfe, 0xff, 0x00, 0x23, 0x00, 0x20, 0x4e, 0x2d]],
  ['cp950／Big5', [0x23, 0x20, 0xa4, 0xa4, 0xa4, 0xe5, 0x0a]],
  ['不合法的 UTF-8', [0x23, 0x20, 0xc3, 0x28, 0x0a]],
  ['含 NUL', [0x23, 0x20, 0x41, 0x00, 0x42, 0x0a]],
]
for (const [name, bytes] of NON_UTF8) {
  test(`review-2：${name} 的 _HANDOFF.md 不寫、不備份，toast 每個 session 一次`, async ($, on) => {
    const w = world(on, 100_000, 1_000_000, {}, [], 5)
    w.files.set(HANDOFF_FILE, new TextDecoder().decode(Uint8Array.from(bytes)))
    ctl.binaryFiles.set(HANDOFF_FILE, Uint8Array.from(bytes))
    const originalText = w.files.get(HANDOFF_FILE)
    await nowHandoff($, w)
    await nowHandoff($, w)
    expect(w.files.get(HANDOFF_FILE)).toBe(originalText)
    expect(w.writes.filter(p => p.includes('_HANDOFF'))).toEqual([])
    expect(w.files.has(`${BACKUP_DIR}/_HANDOFF.md.bak`)).toBe(false)
    expect(w.files.has(`${BACKUP_DIR}/_HANDOFF.md.first.bak`)).toBe(false)
    expect(w.toasts.filter(x => x.includes('_HANDOFF.md 不是 UTF-8 編碼，卡片未寫入')).length).toBe(1)
    // 卡片仍存在 store
    expect(w.get('card:C--proj')).toMatchObject({ status: '修好登入頁' })
    // 換了 session 再說一次
    ctl.curSid = 'S2'
    await nowHandoff($, w)
    expect(w.toasts.filter(x => x.includes('不是 UTF-8 編碼')).length).toBe(2)
  })
}

test('review-2：文字模式讀檔（位元組模式不能用）也認得出亂碼，英文介面的 toast 是英文', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5, 'English')
  const bytes = Uint8Array.from([0x23, 0x20, 0xa4, 0xa4, 0xa4, 0xe5, 0x0a])
  w.files.set(HANDOFF_FILE, new TextDecoder().decode(bytes))
  ctl.binaryFiles.set(HANDOFF_FILE, bytes)
  ctl.textOnly = true
  await nowHandoff($, w)
  expect(w.writes.filter(p => p.includes('_HANDOFF'))).toEqual([])
  expect(w.toasts.some(x => x.includes('_HANDOFF.md is not UTF-8, status card not written'))).toBe(true)
})

test('review-2：嚴格的 UTF-8（含中文、BOM）備份是原檔的位元組複本', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  const original = '\ufeff# 交接\r\n\r\n試過不行的做法：中文與 emoji 😀\r\n'
  w.files.set(HANDOFF_FILE, original)
  await nowHandoff($, w)
  const enc = (s: string) => Array.from(new TextEncoder().encode(s))
  expect(enc(w.files.get(`${BACKUP_DIR}/_HANDOFF.md.bak`) ?? '')).toEqual(enc(original))
  expect(enc(w.files.get(`${BACKUP_DIR}/_HANDOFF.md.first.bak`) ?? '')).toEqual(enc(original))
})

// ---------- review-3：標記要整行、不在程式碼框裡 ----------

test('review-3：內文提到標記的句子不是卡片；插入新卡片時那一行逐位元不動', () => {
  const prose = `ctx-handoff 會維護 ${OPEN_PREFIX}1 --> 與 ${CARD_CLOSE} 之間的內容，也可以寫成 \`${OPEN_PREFIX}2 -->\`。`
  const file = `# T\n\n${prose}\n\n後面\n`
  expect(findCard(file)).toBeUndefined()
  // 只有開頭標記寫在句子裡、結尾標記單獨一行：開頭不算，所以不是 broken
  expect(findCard(`# T\n\n看 ${OPEN_PREFIX}1 --> 這個\n${CARD_CLOSE}\n`)).toBeUndefined()
  const out = applyCard(file, renderCard(FIELDS, META))
  if (!('text' in out)) throw new Error('broken')
  expect(out.text.includes(`\n${prose}\n`)).toBe(true)
  expect(out.text.startsWith('# T\n\n<!-- ctx-handoff:card rev=1 -->')).toBe(true)
  expect(out.text.endsWith(`\n\n${prose}\n\n後面\n`)).toBe(true)
  // 再寫一次：只換真的那張
  const again = applyCard(out.text, renderCard({ ...FIELDS, next: '新的' }, { ...META, rev: 2 }))
  if (!('text' in again)) throw new Error('broken')
  expect(again.text.endsWith(`\n\n${prose}\n\n後面\n`)).toBe(true)
  expect(again.text).toContain('- 下一步：新的')
})

for (const fence of ['```', '~~~', '````']) {
  test(`review-3：程式碼框（${fence}）裡的範例不是卡片，框外真的那張才是；框裡逐位元不動`, () => {
    const example = `${fence}md\n${OPEN_PREFIX}1 -->\n範例\n${CARD_CLOSE}\n${fence}`
    const real = renderCard(FIELDS, { ...META, rev: 5 })
    const file = `# T\n\n${example}\n\n${real}\n\n尾\n`
    const found = findCard(file)
    if (!found || found === 'broken') throw new Error('real card not found')
    expect(found.rev).toBe(5)
    expect(file.slice(0, found.start)).toBe(`# T\n\n${example}\n\n`)
    const out = applyCard(file, renderCard({ ...FIELDS, next: '換掉' }, { ...META, rev: 6 }))
    if (!('text' in out)) throw new Error('broken')
    expect(out.text.startsWith(`# T\n\n${example}\n\n`)).toBe(true)
    expect(out.text.endsWith('\n\n尾\n')).toBe(true)
    expect(count(out.text, OPEN_PREFIX)).toBe(2)
    expect(out.text).toContain('- 下一步：換掉')
    // 只有框裡有範例、框外沒有卡片：新卡片放在 H1 後面，框裡不動
    const only = applyCard(`# T\n\n${example}\n`, renderCard(FIELDS, META))
    if (!('text' in only)) throw new Error('broken')
    expect(only.text.endsWith(`\n\n${example}\n`)).toBe(true)
    expect(only.text.startsWith('# T\n\n<!-- ctx-handoff:card rev=1 -->')).toBe(true)
  })
}

test('review-3：縮排的整行標記算數；程式碼框沒收尾時後面都算框裡', () => {
  const card = renderCard(FIELDS, META).replace(/^/gm, '  ')
  expect(findCard(`# T\n\n${card}\n`)).toMatchObject({ rev: 1 })
  expect(findCard(`# T\n\n\`\`\`\n${renderCard(FIELDS, META)}\n`)).toBeUndefined()
})

// ---------- review-4：對話框逾時與排程觸發 ----------

const TIMEOUT_ZH = '等使用者確認逾時，指令未執行；請改用可復原的做法，或之後請使用者確認。'
const sched = ($: Parameters<typeof cmd>[0]) => $.prompt.submit({ text: '定期檢查', origin: { kind: 'scheduled-trigger' } as never, wait: false })

test('review-4：對話框 120 秒沒人回答就拒絕，並用目前介面語言告訴模型', async ($, on) => {
  const w = world(on, 1000)
  ctl.askHang = true
  const p = $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  await w.clock.advance(119_000)
  let settled = false
  void p.then(() => { settled = true })
  await w.clock.advance(0)
  expect(settled).toBe(false)
  await w.clock.advance(1_000)
  const r = await p
  expect(r.deny).toContain(TIMEOUT_ZH)
  expect(w.asks).toHaveLength(1)
  expect(w.logs.some(l => l.includes('等使用者確認逾時'))).toBe(true)
})

test('review-4：英文介面的逾時訊息是英文', async ($, on) => {
  const w = world(on, 1000, 1_000_000, {}, [], 0, 'English')
  ctl.askHang = true
  const p = $.tool.call({ tool: 'PowerShell', command: 'Remove-Item -Recurse x' })
  await w.clock.advance(120_000)
  expect((await p).deny).toContain('Timed out waiting for the user to confirm; the command was not run.')
})

test('review-4：回答在時限內到就照回答辦，計時器取消', async ($, on) => {
  const w = world(on, 1000)
  ctl.askAnswer = '允許'
  const r = await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })
  expect(r.deny).toBeUndefined()
  await w.clock.advance(200_000)
  expect(w.asks).toHaveLength(1)
})

test('review-4：排程觸發的回合不問人，直接拒絕；使用者自己送訊息之後又會問', async ($, on) => {
  const w = world(on, 1000)
  ctl.askAnswer = '允許'
  await sched($)
  const denied = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  expect(denied.deny).toContain(TIMEOUT_ZH)
  expect(w.asks).toEqual([])
  expect(w.logs.some(l => l.includes('排程觸發的回合沒有人可以確認'))).toBe(true)
  // 無害的指令照常
  expect((await $.tool.call({ tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  await say($, '我回來了')
  expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })).deny).toBeUndefined()
  expect(w.asks).toHaveLength(1)
})

// ---------- review-5：備份 ----------

test('review-5：.first.bak 有史以來只寫一次、永不覆蓋；.bak 每個 session 第一次寫之前更新', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  const original = '# 交接\n\n最早的樣子\n'
  w.files.set(HANDOFF_FILE, original)
  await nowHandoff($, w)
  const first = `${BACKUP_DIR}/_HANDOFF.md.first.bak`
  const roll = `${BACKUP_DIR}/_HANDOFF.md.bak`
  expect(w.files.get(first)).toBe(original)
  expect(w.files.get(roll)).toBe(original)
  const afterS1 = w.files.get(HANDOFF_FILE) ?? ''
  ctl.cardReply = JSON.stringify({ next: '第二個 session' })
  ctl.curSid = 'S2'
  await nowHandoff($, w)
  expect(w.files.get(first)).toBe(original)
  expect(w.files.get(roll)).toBe(afterS1)
  expect(w.writes.filter(p => p === first).length).toBe(1)
  ctl.curSid = 'S3'
  ctl.cardReply = JSON.stringify({ next: '第三個' })
  await nowHandoff($, w)
  expect(w.writes.filter(p => p === first).length).toBe(1)
  expect(w.files.get(roll)).not.toBe(afterS1)
})

// ---------- review-6：模型呼叫期間手改卡片 ----------

test('review-6：模型呼叫期間使用者手改了卡片，這次更新作廢、不寫檔、toast 一次，store 不動', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  w.files.set(HANDOFF_FILE, '# 交接\n')
  await nowHandoff($, w)
  const stored = JSON.stringify(w.get('card:C--proj'))
  ctl.cardReply = JSON.stringify({ next: '模型想寫的' })
  ctl.onCard = () => {
    ctl.onCard = undefined
    w.files.set(HANDOFF_FILE, (w.files.get(HANDOFF_FILE) ?? '').replace('補 refresh token 的測試', '我自己改的下一步'))
  }
  await nowHandoff($, w)
  const text = w.files.get(HANDOFF_FILE) ?? ''
  expect(text).toContain('我自己改的下一步')
  expect(text).not.toContain('模型想寫的')
  expect(text).toContain('rev=1')
  expect(JSON.stringify(w.get('card:C--proj'))).toBe(stored)
  expect(w.toasts.filter(x => x.includes('你在更新期間改了')).length).toBe(1)
  // 下一次更新從使用者改過的版本接著來
  ctl.cardReply = JSON.stringify({ status: '再來' })
  await nowHandoff($, w)
  expect(w.cards.at(-1)?.prompt).toContain('- 下一步：我自己改的下一步')
  expect(parseCard(findCardText(w.files.get(HANDOFF_FILE) ?? '')).next).toBe('我自己改的下一步')
})

const findCardText = (text: string) => {
  const f = findCard(text)
  if (!f || f === 'broken') throw new Error('card missing')
  return f.text
}

// ---------- review-7：YAML front matter ----------

const FM = '---\ntitle: 交接\n# 這是 YAML 註解\n---'

test('review-7：front matter 後面的第一個 H1 之後才放卡片；front matter 逐位元不動', () => {
  const file = `${FM}\n\n# 交接\n\n內容\n`
  const out = applyCard(file, renderCard(FIELDS, META))
  if (!('text' in out)) throw new Error('broken')
  expect(out.text.startsWith(`${FM}\n\n# 交接\n\n<!-- ctx-handoff:card rev=1 -->`)).toBe(true)
  expect(out.text.endsWith('\n\n內容\n')).toBe(true)
})

test('review-7：有 front matter 沒有 H1：放在結尾的 --- 後面，不放進或放到它上面；YAML 裡的 # 不是 H1', () => {
  const file = `${FM}\n正文\n`
  const out = applyCard(file, renderCard(FIELDS, META))
  if (!('text' in out)) throw new Error('broken')
  expect(out.text).toBe(`${FM}\n\n${renderCard(FIELDS, META)}\n\n正文\n`)
  // 再寫一次：只換卡片
  const again = applyCard(out.text, renderCard({ ...FIELDS, next: '新' }, { ...META, rev: 2 }))
  if (!('text' in again)) throw new Error('broken')
  expect(again.text.startsWith(`${FM}\n\n<!-- ctx-handoff:card rev=2 -->`)).toBe(true)
  expect(again.text.endsWith('\n\n正文\n')).toBe(true)
  // 只有 front matter
  const only = applyCard(`${FM}`, renderCard(FIELDS, META))
  expect('text' in only && only.text).toBe(`${FM}\n\n${renderCard(FIELDS, META)}`)
})

test('review-7：front matter 用 CRLF、加 BOM、用 ... 收尾也一樣；沒有收尾的 --- 不是 front matter', () => {
  const crlf = '\ufeff---\r\ntitle: x\r\n...\r\n正文\r\n'
  const out = applyCard(crlf, renderCard(FIELDS, META))
  if (!('text' in out)) throw new Error('broken')
  expect(out.text.startsWith('\ufeff---\r\ntitle: x\r\n...\r\n\r\n<!-- ctx-handoff:card rev=1 -->\r\n')).toBe(true)
  expect(out.text.endsWith('\r\n\r\n正文\r\n')).toBe(true)
  // 沒收尾：第一行的 --- 只是分隔線，照一般規則（H1 後面）
  const open = applyCard('---\n# T\n內文\n', renderCard(FIELDS, META))
  expect('text' in open && open.text.startsWith('---\n# T\n\n<!-- ctx-handoff:card rev=1 -->')).toBe(true)
})

// ---------- review-10：摘要的「目前工作」 ----------

const user = (ts: string, content: unknown) => JSON.stringify({ type: 'user', timestamp: ts, isSidechain: false, message: { role: 'user', content } })

test('review-10：[Request interrupted by user] 這類方括號系統行不當目前工作，往前找真正的要求', () => {
  const entries = parseTail([
    user('2026-10-09T10:00:00.000Z', '請修好登入頁'),
    user('2026-10-09T10:05:00.000Z', '[Request interrupted by user]'),
    user('2026-10-09T10:06:00.000Z', '[Request interrupted by user for tool use]'),
  ].join('\n'), false)
  expect(digestOf(entries).task).toBe('請修好登入頁')
  expect(digestOfRows([
    { role: 'user', text: '請修好登入頁', toolUses: [] },
    { role: 'user', text: '[Request interrupted by user]', toolUses: [] },
  ]).task).toBe('請修好登入頁')
})

test('review-10：已知的系統標籤不算，其他用 < 開頭的使用者訊息照常算', () => {
  const sys = ['<command-name>/clear</command-name>', '<local-command-stdout>ok</local-command-stdout>', '<system-reminder>x</system-reminder>']
  const entries = parseTail([
    user('2026-10-09T10:00:00.000Z', '<div class="x">這段 HTML 怎麼改</div>'),
    ...sys.map((s, i) => user(`2026-10-09T10:0${i + 1}:00.000Z`, s)),
  ].join('\n'), false)
  expect(digestOf(entries).task).toBe('<div class="x">這段 HTML 怎麼改</div>')
  expect(digestOfRows([
    { role: 'user', text: '<b>粗體</b> 怎麼做', toolUses: [] },
    { role: 'user', text: '<command-name>/clear</command-name>', toolUses: [] },
  ]).task).toBe('<b>粗體</b> 怎麼做')
  // 方括號開頭但不是整則一行的，是使用者的話
  expect(digestOf(parseTail(user('2026-10-09T10:00:00.000Z', '[重要] 先修登入頁'), false)).task).toBe('[重要] 先修登入頁')
})


// ---------- review2-A：資料遺失——假標記行不能讓更新吞掉使用者的文字 ----------

const OPEN1 = `${OPEN_PREFIX}1 -->`

test('review2-A：縮排 4 個空格或 tab（清單項目裡的程式碼區塊）的標記行不是卡片，更新不吞掉前面的文字', () => {
  for (const indent of ['    ', '\t', '      ']) {
    const fake = `- 範例：\n\n${indent}${OPEN1}\n${indent}我的手寫文字\n${indent}${CARD_CLOSE}\n`
    const real = renderCard(FIELDS, { ...META, rev: 4 })
    const file = `# T\n\n${fake}\n${real}\n\n尾\n`
    const found = findCard(file)
    if (!found || found === 'broken') throw new Error('real card not found')
    expect(found.rev).toBe(4)
    expect(file.slice(0, found.start)).toBe(`# T\n\n${fake}\n`)
    const out = applyCard(file, renderCard({ ...FIELDS, next: '換掉' }, { ...META, rev: 5 }))
    if (!('text' in out)) throw new Error('broken')
    expect(out.text.startsWith(`# T\n\n${fake}\n`)).toBe(true)
    expect(count(out.text, '我的手寫文字')).toBe(1)
    expect(out.text.endsWith('\n\n尾\n')).toBe(true)
  }
  // 只有縮排的假標記、沒有真的卡片：不是卡片，新卡片放 H1 後面，假的逐位元不動
  const only = `# T\n\n    ${OPEN1}\n    手寫\n    ${CARD_CLOSE}\n`
  expect(findCard(only)).toBeUndefined()
  const ins = applyCard(only, renderCard(FIELDS, META))
  expect('text' in ins && ins.text.endsWith(`\n\n    ${OPEN1}\n    手寫\n    ${CARD_CLOSE}\n`)).toBe(true)
})

test('review2-A：包在多行 HTML 註解裡的標記行不是卡片（註解開頭在前一行）', () => {
  const real = renderCard(FIELDS, { ...META, rev: 7 })
  for (const wrapped of [
    `<!--\n${OPEN1}\n-->`,
    `<!--\n${OPEN1}\n老文字\n${CARD_CLOSE}\n-->`,
    `<!-- 筆記\n${OPEN1}\n${CARD_CLOSE}\n-->`,
  ]) {
    const file = `# T\n\n${wrapped}\n\n${real}\n\n尾\n`
    const found = findCard(file)
    if (!found || found === 'broken') throw new Error(`real card not found: ${wrapped}`)
    expect(found.rev).toBe(7)
    expect(file.slice(0, found.start)).toBe(`# T\n\n${wrapped}\n\n`)
    const out = applyCard(file, renderCard({ ...FIELDS, next: '換掉' }, { ...META, rev: 8 }))
    if (!('text' in out)) throw new Error('broken')
    expect(out.text.startsWith(`# T\n\n${wrapped}\n\n`)).toBe(true)
    expect(out.text.endsWith('\n\n尾\n')).toBe(true)
    expect(count(out.text, '老文字')).toBe(wrapped.includes('老文字') ? 1 : 0)
  }
})

test('review2-A：配對是第一個結尾標記加上它上面最近的開頭標記；前面多出來的整行假開頭不會把文字吞進去', () => {
  const real = renderCard(FIELDS, { ...META, rev: 3 })
  const file = `# T\n\n${OPEN1}\n我寫的一大段話\n\n${real}\n\n尾\n`
  const found = findCard(file)
  if (!found || found === 'broken') throw new Error('card missing')
  expect(found.rev).toBe(3)
  expect(file.slice(0, found.start)).toBe(`# T\n\n${OPEN1}\n我寫的一大段話\n\n`)
  const out = applyCard(file, renderCard(FIELDS, { ...META, rev: 4 }))
  expect('text' in out && out.text.includes('我寫的一大段話')).toBe(true)
  // 前面有孤兒結尾標記（上面沒有開頭）也不影響
  const orphan = `# T\n\n${CARD_CLOSE}\n\n${real}\n`
  const f2 = findCard(orphan)
  expect(f2 && f2 !== 'broken' && f2.rev).toBe(3)
  // 開頭標記後面沒有結尾標記：仍是 broken
  expect(findCard(`# T\n\n${OPEN1}\n手寫`)).toBe('broken')
  // 三個空格以內的縮排照舊算數
  expect(findCard(`# T\n\n   ${OPEN1}\n   ${CARD_CLOSE}\n`)).toMatchObject({ rev: 1 })
})
