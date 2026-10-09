// 狀態卡：專案 _HANDOFF.md 裡 ctx-handoff 標記之間的一段。純函式（放進檔案、解析、後備填法）和經由 plugin 的流程（沒有檔案不建立、備份、並行修改不覆蓋、換行與 BOM、觸發時機）
import { expect, test } from 'claude-code/testing'
import { applyCard, cardFromHandoff, cardFromProgress, emptyFields, findCard, handoffSections, newCardFile, parseCard, parseCardReply, renderCard, taipeiStamp } from './card'
import type { CardFields } from './card'
import { actionsReply, cmd, ctl, distillNow, endTurn, say, startSession, stop, world } from './test-world'

const HANDOFF_FILE = 'C:/proj/_HANDOFF.md'
const BACKUP = 'C:/proj/.ctx-handoff-backup/_HANDOFF.md.bak'
const FIELDS: CardFields = {
  status: '修好登入頁', running: '', waiting: '', next: '補 refresh token 的測試', verified: 'npm test：12 項通過',
  failed: ['直接改 cookie 沒用'], decisions: ['用 refresh token'],
}
const META = { at: Date.UTC(2026, 9, 9, 10, 40), sid: 'abcdef1234567890', rev: 3 }
const block = (f: CardFields = FIELDS, meta = META) => renderCard(f, meta)
const START = '<!-- ctx-handoff:card rev='
const END = '<!-- /ctx-handoff:card -->'

// ---------- 純函式 ----------

test('卡片：欄位、標記、台北時間與 session 前 8 碼', () => {
  const text = block()
  expect(text.startsWith('<!-- ctx-handoff:card rev=3 -->\n')).toBe(true)
  expect(text.endsWith(`\n${END}`)).toBe(true)
  expect(text).toContain('- 更新：2026/10/09 18:40 · session abcdef12 · rev 3')
  expect(text).toContain('- 狀態：修好登入頁')
  expect(text).toContain('- 等使用者：無')
  expect(text).toContain('- 下一步：補 refresh token 的測試')
  expect(text).toContain('- 試過不行的做法：\n  - 直接改 cookie 沒用')
  expect(text).toContain('- 決策：\n  - 用 refresh token')
  expect(taipeiStamp(Date.UTC(2026, 11, 31, 16, 5))).toBe('2027/01/01 00:05')
  // 解析回來：無＝空，列表逐條
  const back = parseCard(text)
  expect(back).toMatchObject({ ...FIELDS, waiting: '', rev: 3 })
  expect(renderCard(emptyFields(), META)).toContain('- 試過不行的做法：無')
})

test('放進檔案：有 H1 就放在第一個 H1 後面，其餘每個字元不動', () => {
  const file = '# 交接\n\n手寫的內容\n\n## 其他\n文字'
  const out = applyCard(file, block())
  expect('text' in out && out.text).toBe(`# 交接\n\n${block()}\n\n手寫的內容\n\n## 其他\n文字`)
  // H1 後面緊接內容（沒有空行）：卡片和內容之間補一個空行
  expect(applyCard('# T\nbody', block())).toEqual({ text: `# T\n\n${block()}\n\nbody` })
  // 只有標題、沒有結尾換行
  expect(applyCard('# T', block())).toEqual({ text: `# T\n\n${block()}` })
  // 程式碼框裡的 # 不是標題；## 不是 H1
  const fenced = '```sh\n# 註解\n```\n## 二級\n# 真的標題\n內容'
  const o2 = applyCard(fenced, block())
  expect('text' in o2 && o2.text).toBe(`\`\`\`sh\n# 註解\n\`\`\`\n## 二級\n# 真的標題\n\n${block()}\n\n內容`)
  // 沒有 H1：放最上面
  expect(applyCard('只有內文\n', block())).toEqual({ text: `${block()}\n\n只有內文\n` })
  expect(applyCard('', block())).toEqual({ text: `${block()}\n` })
})

test('放進檔案：已有標記只換標記之間，標記以外逐位元相同，版次更新；不會再多一個區塊', () => {
  const before = `# 交接\n\n前面手寫  \n\n${block(FIELDS, { ...META, rev: 1 })}\n\n後面手寫\t\n結尾`
  const next = renderCard({ ...FIELDS, next: '寫文件' }, { ...META, rev: 2 })
  const out = applyCard(before, next)
  expect('text' in out).toBe(true)
  const text = 'text' in out ? out.text : ''
  expect(text).toBe(`# 交接\n\n前面手寫  \n\n${next}\n\n後面手寫\t\n結尾`)
  expect(text.split(START).length - 1).toBe(1)
  const found = findCard(text)
  expect(found && found !== 'broken' && found.rev).toBe(2)
  // 標記外的前後文字
  const f = findCard(before)
  if (!f || f === 'broken') throw new Error('no card')
  expect(text.startsWith(before.slice(0, f.start))).toBe(true)
  expect(text.endsWith(before.slice(f.end))).toBe(true)
})

test('放進檔案：CRLF 檔案整段用 CRLF，LF 檔案用 LF；BOM 保留', () => {
  const crlf = '# 交接\r\n\r\n內容\r\n'
  const out = applyCard(crlf, block())
  const text = 'text' in out ? out.text : ''
  expect(text).toBe(`# 交接\r\n\r\n${block().replace(/\n/g, '\r\n')}\r\n\r\n內容\r\n`)
  expect(text.replace(/\r\n/g, '').includes('\n')).toBe(false)
  // 第二次更新：標記之間換掉、檔案其他地方不變
  const again = applyCard(text, renderCard({ ...FIELDS, status: '新狀態' }, { ...META, rev: 4 }))
  const t2 = 'text' in again ? again.text : ''
  expect(t2.replace(/\r\n/g, '').includes('\n')).toBe(false)
  expect(t2).toContain('- 狀態：新狀態')
  expect(t2.endsWith('\r\n\r\n內容\r\n')).toBe(true)
  // BOM 在最前面，H1 判斷不受影響
  const bom = '\ufeff# 交接\n\n內容'
  const b = applyCard(bom, block())
  expect('text' in b && b.text).toBe(`\ufeff# 交接\n\n${block()}\n\n內容`)
  const noH1 = applyCard('\ufeff只有內文', block())
  expect('text' in noH1 && noH1.text).toBe(`\ufeff${block()}\n\n只有內文`)
})

test('放進檔案：有開頭標記沒有結尾標記不動它；只有結尾標記視為沒有卡片', () => {
  expect(applyCard(`# T\n\n${START}2 -->\n手寫`, block())).toEqual({ error: 'broken' })
  expect(findCard(`${START}2 -->\nx`)).toBe('broken')
  expect(findCard(`x ${END}`)).toBeUndefined()
  expect(findCard('沒有卡片')).toBeUndefined()
})

test('新檔：只有「# 交接」標題和卡片', () => {
  expect(newCardFile(block())).toBe(`# 交接\n\n${block()}\n`)
})

test('模型回覆：缺的欄位沿用上一版、列表最多 5 條、超長截短、疑似金鑰丟掉、不是 JSON 回 undefined', () => {
  const prev = FIELDS
  const ok = parseCardReply('好的：\n{"status":"新狀態","next":"跑測試","failed":["a","b","c","d","e","f"],"decisions":[]}', prev)
  expect(ok).toMatchObject({ status: '新狀態', next: '跑測試', verified: prev.verified, running: prev.running })
  expect(ok?.failed).toEqual(['a', 'b', 'c', 'd', 'e'])
  expect(ok?.decisions).toEqual([])
  const long = parseCardReply(JSON.stringify({ status: 'x'.repeat(300) }), prev)
  expect([...(long?.status ?? '')].length).toBe(120)
  const secret = parseCardReply(JSON.stringify({ status: '新', next: 'export api_key=abc123 後跑', failed: ['token: abc'] }), prev)
  expect(secret?.next).toBe(prev.next)
  expect(secret?.failed).toEqual([])
  expect(parseCardReply('沒有 JSON', prev)).toBeUndefined()
  expect(parseCardReply('[1,2]', prev)).toBeUndefined()
  expect(parseCardReply('{"status":"","next":""}', emptyFields())).toBeUndefined()
})

test('後備：沒有模型時從 handoff 摘要的段落填狀態、下一步、驗證（中文與英文標題）', () => {
  const zh = [
    'HANDOFF: 修好登入頁的逾時',
    '1. 目標：登入逾時 30 秒要改成 10 秒',
    '2. 已驗證：npm test 12 項通過',
    '3. 已做但未驗證：refresh token 邏輯',
    '4. 試過但失敗的做法與原因：直接改 cookie 沒用',
    '5. 還在跑或沒收尾的東西：無',
    '6. 已做的決定與理由：用 refresh token',
    '7. 相關檔案路徑與指令：src/auth/login.ts',
    '8. 下一步：補 refresh token 過期的測試',
    '9. 待使用者回答的問題：要不要同時改 mobile',
  ].join('\n')
  const f = cardFromHandoff(zh, { ...emptyFields(), failed: ['舊的失敗'] })
  expect(f).toMatchObject({ status: '修好登入頁的逾時', next: '補 refresh token 過期的測試', verified: 'npm test 12 項通過', running: '', waiting: '要不要同時改 mobile', failed: ['舊的失敗'] })
  const en = ['HANDOFF: fix the login timeout', '**Goal**: shorten it', '## 2. Verified', '- ran npm test: 12 passed', '## 8. Next step', 'Add a test for refresh token expiry'].join('\n')
  const g = cardFromHandoff(en, emptyFields())
  expect(g).toMatchObject({ status: 'fix the login timeout', verified: 'ran npm test: 12 passed', next: 'Add a test for refresh token expiry' })
  // 段落的判斷：標題字在行首、後面接冒號或結束才算
  expect(handoffSections('目標檔案是 a.ts\n下一步：做 X')).toEqual({ next: '做 X' })
  // 認不得任何段落：只有 HANDOFF 那行，其餘沿用
  expect(cardFromHandoff('隨便寫寫', FIELDS)).toEqual(FIELDS)
})

test('後備：沒有模型時從進度備忘填', () => {
  const f = cardFromProgress({ task: '修好登入頁', state: 'blocked', next: '等連線字串', verified: '跑過乾跑', files: [] }, FIELDS)
  expect(f).toMatchObject({ status: '卡住了：修好登入頁', next: '等連線字串', verified: '跑過乾跑', failed: FIELDS.failed })
  expect(cardFromProgress({ task: '發版', state: 'done', files: [] }, FIELDS).next).toBe('')
})

// ---------- 經由 plugin ----------

const NOW_HANDOFF = async ($: Parameters<typeof cmd>[0], w: ReturnType<typeof world>) => {
  await cmd($, 'now')
  await w.clock.advance(0)
}

test('沒有 _HANDOFF.md：交接後不建立檔案，卡片只存在 store，狀態說明這件事', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  await NOW_HANDOFF($, w)
  expect(w.files.has(HANDOFF_FILE)).toBe(false)
  expect(w.writes.some(p => p.includes('_HANDOFF'))).toBe(false)
  const rec = w.get('card:C--proj') as { status: string; next: string; rev: number; sid: string }
  expect(rec).toMatchObject({ status: '修好登入頁', next: '補 refresh token 的測試', rev: 1, sid: 'S1' })
  expect(w.cards.length).toBe(1)
  expect((await cmd($, '')).text).toContain('狀態卡：只存在 ctx-handoff 的 store（rev 1')
  expect((await cmd($, '')).text).toContain('/handoff card init 建立')
})

test('/handoff card init：建立只有「# 交接」標題和卡片的 _HANDOFF.md；已存在就不動', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  const first = await cmd($, 'card init')
  expect(first.text).toContain('已建立')
  const text = w.files.get(HANDOFF_FILE) ?? ''
  expect(text.startsWith('# 交接\n\n<!-- ctx-handoff:card rev=1 -->\n')).toBe(true)
  expect(text.endsWith('<!-- /ctx-handoff:card -->\n')).toBe(true)
  expect(text.match(/^# /gm)?.length).toBe(1)
  w.files.set(HANDOFF_FILE, '# 我的\n手寫')
  const second = await cmd($, 'card init')
  expect(second.text).toContain('已經存在')
  expect(w.files.get(HANDOFF_FILE)).toBe('# 我的\n手寫')
  expect((await cmd($, 'card oops')).text).toContain('用法 /handoff card')
})

test('有 _HANDOFF.md：第一次放在第一個 H1 後面，之後只換標記之間；標記外的手寫內容逐位元不動', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  const original = '# 專案交接\n\n我手寫的重點  \n- 一\n- 二\n\n## 備忘\n不要動我\n'
  w.files.set(HANDOFF_FILE, original)
  await NOW_HANDOFF($, w)
  const t1 = w.files.get(HANDOFF_FILE) ?? ''
  const f1 = findCard(t1)
  if (!f1 || f1 === 'broken') throw new Error('card missing')
  expect(f1.rev).toBe(1)
  expect(t1.slice(0, f1.start)).toBe('# 專案交接\n\n')
  expect(t1.slice(f1.end)).toBe('\n\n我手寫的重點  \n- 一\n- 二\n\n## 備忘\n不要動我\n')
  expect(parseCard(f1.text)).toMatchObject({ status: '修好登入頁', next: '補 refresh token 的測試', verified: 'npm test：12 項通過' })
  expect(f1.text).toContain('session S1')
  // 備份是更新前的原檔
  expect(w.files.get(BACKUP)).toBe(original)
  // 第二次：版次 +1，標記外與第一次完全相同；備份不再覆蓋（同一個 session）
  ctl.cardReply = JSON.stringify({ next: '寫文件', failed: [] })
  await NOW_HANDOFF($, w)
  const t2 = w.files.get(HANDOFF_FILE) ?? ''
  const f2 = findCard(t2)
  if (!f2 || f2 === 'broken') throw new Error('card missing')
  expect(f2.rev).toBe(2)
  expect(t2.slice(0, f2.start)).toBe(t1.slice(0, f1.start))
  expect(t2.slice(f2.end)).toBe(t1.slice(f1.end))
  expect(t2.split('<!-- ctx-handoff:card').length - 1).toBe(1)
  expect(parseCard(f2.text)).toMatchObject({ next: '寫文件', failed: [], status: '修好登入頁' })
  expect(w.files.get(BACKUP)).toBe(original)
  // 上一版卡片當輸入：模型請求只有上一版、session 摘要和 handoff，不送整段對話
  const req = w.cards.at(-1)?.prompt ?? ''
  expect(req).toContain('=== 上一版狀態卡 ===')
  expect(req).toContain('- 下一步：補 refresh token 的測試')
  expect(req).toContain('=== 對話摘要（這個 session 尾端） ===')
  expect(req).toContain('HANDOFF: 測試')
  expect(w.cards.at(-1)?.effort).toBe('low')
  expect(w.cards.at(-1)?.model).toBe('claude-sonnet-5-5')
})

test('換行與 BOM 跟著檔案：CRLF 檔案寫完仍是 CRLF，BOM 還在', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  const original = '\ufeff# 交接\r\n\r\n手寫\r\n'
  w.files.set(HANDOFF_FILE, original)
  await NOW_HANDOFF($, w)
  const text = w.files.get(HANDOFF_FILE) ?? ''
  expect(text.startsWith('\ufeff# 交接\r\n\r\n<!-- ctx-handoff:card rev=1 -->\r\n')).toBe(true)
  expect(text.replace(/\r\n/g, '').includes('\n')).toBe(false)
  expect(text.endsWith('\r\n\r\n手寫\r\n')).toBe(true)
  expect(w.files.get(BACKUP)).toBe(original)
})

test('寫入前檔案被改：重讀重組一次，使用者的修改和卡片都在', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  w.files.set(HANDOFF_FILE, '# 交接\n\n原本')
  let edited = false
  ctl.afterRead = path => {
    if (path !== HANDOFF_FILE || edited) return
    edited = true
    w.files.set(HANDOFF_FILE, '# 交接\n\n原本\n使用者剛加的一行')
  }
  await NOW_HANDOFF($, w)
  const text = w.files.get(HANDOFF_FILE) ?? ''
  expect(text).toContain('使用者剛加的一行')
  expect(text).toContain('<!-- ctx-handoff:card rev=1 -->')
  expect(w.toasts.some(x => x.includes('沒有寫入'))).toBe(false)
})

test('寫入前檔案一直被改：放棄，不覆蓋使用者的檔案，跳 toast', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  w.files.set(HANDOFF_FILE, '# 交接\n\n原本')
  let n = 0
  ctl.afterRead = path => {
    if (path !== HANDOFF_FILE) return
    n += 1
    w.files.set(HANDOFF_FILE, `# 交接\n\n原本\n使用者第 ${n} 次修改`)
  }
  await NOW_HANDOFF($, w)
  expect(w.files.get(HANDOFF_FILE)).toBe(`# 交接\n\n原本\n使用者第 ${n} 次修改`)
  expect(w.files.get(HANDOFF_FILE)).not.toContain('ctx-handoff:card')
  expect(w.toasts.some(x => x.includes('在寫入前被改動'))).toBe(true)
  // 卡片仍存在 store 裡
  expect(w.get('card:C--proj')).toMatchObject({ status: '修好登入頁' })
})

test('標記壞掉（有開頭沒結尾）：不動檔案，跳 toast', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  const broken = '# 交接\n\n<!-- ctx-handoff:card rev=4 -->\n手寫到一半'
  w.files.set(HANDOFF_FILE, broken)
  await NOW_HANDOFF($, w)
  expect(w.files.get(HANDOFF_FILE)).toBe(broken)
  expect(w.toasts.some(x => x.includes('找不到結尾標記'))).toBe(true)
})

test('備份每個 session 的第一次寫之前做一次；換了 session 再備份（內容是當時的檔案）', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  w.files.set(HANDOFF_FILE, '# 交接\n\n甲')
  await NOW_HANDOFF($, w)
  expect(w.files.get(BACKUP)).toBe('# 交接\n\n甲')
  const afterFirst = w.files.get(HANDOFF_FILE) ?? ''
  const backups = () => w.writes.filter(p => p === BACKUP).length
  expect(backups()).toBe(1)
  ctl.cardReply = JSON.stringify({ next: '乙' })
  await NOW_HANDOFF($, w)
  expect(backups()).toBe(1)
  ctl.curSid = 'S2'
  ctl.cardReply = JSON.stringify({ next: '丙' })
  await NOW_HANDOFF($, w)
  expect(backups()).toBe(2)
  expect(w.files.get(BACKUP)?.startsWith('# 交接')).toBe(true)
  expect(w.files.get(BACKUP)).not.toBe(afterFirst)
})

test('模型請求失敗：直接從 handoff 摘要填狀態與下一步，其餘沿用上一版', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, { 'card:C--proj': { ...FIELDS, at: 0, sid: 'S0', rev: 4 } }, [], 5)
  w.files.set(HANDOFF_FILE, '# 交接\n')
  ctl.cardFails = true
  await NOW_HANDOFF($, w)
  const f = findCard(w.files.get(HANDOFF_FILE) ?? '')
  if (!f || f === 'broken') throw new Error('card missing')
  const card = parseCard(f.text)
  // 測試的 handoff 摘要是「HANDOFF: 測試」：只有目標，沒有段落
  expect(card.status).toBe('測試')
  expect(card.next).toBe(FIELDS.next)
  expect(card.decisions).toEqual(FIELDS.decisions)
  expect(f.rev).toBe(5)
  expect(w.logs.some(l => l.includes('模型整理失敗'))).toBe(true)
})

test('card_model：留空用 notes_model，設了就用它', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  ctl.pluginOptions = { ...ctl.pluginOptions, notes_model: 'claude-opus-5-5' }
  await NOW_HANDOFF($, w)
  expect(w.cards[0]?.model).toBe('claude-opus-5-5')
  ctl.pluginOptions = { ...ctl.pluginOptions, notes_model: 'claude-opus-5-5', card_model: 'claude-sonnet-5-5' }
  await say($, '再說一句')
  await NOW_HANDOFF($, w)
  expect(w.cards.at(-1)?.model).toBe('claude-sonnet-5-5')
})

test('card 設定關閉：不更新卡片、不建檔，/handoff card init 說明要先打開', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  ctl.pluginOptions = { ...ctl.pluginOptions, card: false }
  w.files.set(HANDOFF_FILE, '# 交接\n')
  await NOW_HANDOFF($, w)
  expect(w.files.get(HANDOFF_FILE)).toBe('# 交接\n')
  expect(w.cards.length).toBe(0)
  expect(w.get('card:C--proj')).toBeUndefined()
  expect((await cmd($, 'card init')).text).toContain('狀態卡設定是關的')
  expect((await cmd($, '')).text).toContain('狀態卡：關')
})

test('背景整理有 set_progress 時更新卡片；沒有 set_progress 就不更新', async ($, on) => {
  let turns = 5
  const w = world(on, 100_000, 1_000_000, {}, [], () => turns)
  w.files.set(HANDOFF_FILE, '# 交接\n')
  ctl.distillReply = actionsReply({ op: 'add_memory', type: 'project', title: '只有記憶', evidence: 'x' })
  await distillNow($)
  expect(w.cards.length).toBe(0)
  expect(w.files.get(HANDOFF_FILE)).toBe('# 交接\n')
  ctl.distillReply = actionsReply({ op: 'set_progress', task: '修好登入頁', state: 'in_progress', next: '補測試', verified: 'npm test 通過', files: [] })
  turns += 5
  await distillNow($)
  expect(w.cards.length).toBe(1)
  // 來源標示是進度備忘，內容帶進模型請求
  expect(w.cards[0]?.prompt).toContain('=== 進度備忘（set_progress） ===')
  expect(w.cards[0]?.prompt).toContain('補測試')
  const f = findCard(w.files.get(HANDOFF_FILE) ?? '')
  expect(f && f !== 'broken' && parseCard(f.text).status).toBe('修好登入頁')
})

test('自動交接：交接那次的卡片為準，同時跑完的進度備忘更新不會蓋過它', async ($, on) => {
  const w = world(on, 650_000, 1_000_000, {}, [], 5)
  w.files.set(HANDOFF_FILE, '# 交接\n')
  ctl.distillReply = actionsReply({ op: 'set_progress', task: '舊進度', state: 'in_progress', next: '舊的下一步', files: [] })
  ctl.onClear = () => { ctl.curSid = 'S2' }
  await stop($)
  await w.clock.advance(0)
  expect(w.commands).toEqual(['clear'])
  const f = findCard(w.files.get(HANDOFF_FILE) ?? '')
  if (!f || f === 'broken') throw new Error('card missing')
  // 最後一個模型請求的來源是 handoff 摘要
  expect(w.cards.at(-1)?.prompt).toContain('=== handoff 摘要 ===')
  expect(parseCard(f.text).next).toBe('補 refresh token 的測試')
  expect(f.text).toContain('session S1')
})

test('離席 handoff（閒置存檔）也更新卡片', async ($, on) => {
  const w = world(on, 100_000)
  w.files.set(HANDOFF_FILE, '# 交接\n')
  ctl.pluginOptions = { ...ctl.pluginOptions, max_refresh: 0 }
  await endTurn($)
  await w.clock.advance(55 * 60_000)
  expect(w.get('away:S1')).toBeDefined()
  expect(findCard(w.files.get(HANDOFF_FILE) ?? '')).toMatchObject({ rev: 1 })
})

// ---------- A10：新對話開頭的「停在哪」 ----------

const PROGRESS_REC = { sid: 'S0', at: 0, task: '進度備忘的任務', state: 'blocked', next: '進度備忘的下一步', files: [] }
const blockOf = async ($: Parameters<typeof cmd>[0]) => (await $.prompt.context({ blocks: [] })).blocks.find(b => b.name === 'ctxHandoffProgress')?.text

test('停在哪：有卡片就讀卡片的狀態與下一步，進度備忘不重複提供', async ($, on) => {
  world(on, 100_000, 1_000_000, {
    'card:C--proj': { ...FIELDS, at: 0, sid: 'S0', rev: 2 },
    'progress:C--proj': { sid: 'S0', at: 0, task: '進度備忘的任務', state: 'blocked', next: '進度備忘的下一步', files: [] },
  }, [], 5)
  await startSession($)
  const text = await blockOf($)
  expect(text).toContain('停在：狀態：修好登入頁；下一步：補 refresh token 的測試')
  expect(text).not.toContain('進度備忘的任務')
  // 同一段對話只提供一次，進度備忘也不再重複提供
  expect(await blockOf($)).toBeUndefined()
})

test('停在哪：檔案裡的卡片優先（使用者手改過的下一步）；卡片沒有內容、card 關閉時退回進度備忘', async ($, on) => {
  const edited = renderCard({ ...FIELDS, next: '我自己改的下一步' }, META)
  const w = world(on, 100_000, 1_000_000, {
    'card:C--proj': { ...FIELDS, at: 0, sid: 'S0', rev: 2 },
    'progress:C--proj': { sid: 'S0', at: 0, task: '進度備忘的任務', state: 'blocked', next: '進度備忘的下一步', files: [] },
  }, [], 5)
  w.files.set(HANDOFF_FILE, `# 交接\n\n${edited}\n`)
  expect(await blockOf($)).toContain('下一步：我自己改的下一步')
  w.put('card:C--proj', { ...emptyFields(), at: 0, sid: 'S0', rev: 2 })
  w.put('progress:C--proj', PROGRESS_REC)
  w.files.delete(HANDOFF_FILE)
  expect(await blockOf($)).toContain('任務「進度備忘的任務」')
  w.put('card:C--proj', { ...FIELDS, at: 0, sid: 'S0', rev: 2 })
  w.put('progress:C--proj', PROGRESS_REC)
  ctl.pluginOptions = { ...ctl.pluginOptions, card: false }
  await say($, '換設定')
  expect(await blockOf($)).toContain('任務「進度備忘的任務」')
})

test('停在哪：已交接出去的、同一個 session 的、超過一天的卡片不提供', async ($, on) => {
  const DAY = 24 * 60 * 60_000
  const w = world(on, 100_000, 1_000_000, { 'card:C--proj': { ...FIELDS, at: 0, sid: 'S0', rev: 2, handed: true } }, [], 5)
  expect(await blockOf($)).toBeUndefined()
  w.put('card:C--proj', { ...FIELDS, at: 0, sid: 'S1', rev: 2 })
  expect(await blockOf($)).toBeUndefined()
  w.put('card:C--proj', { ...FIELDS, at: 0, sid: 'S0', rev: 2 })
  await w.clock.advance(DAY + 60_000)
  expect(await blockOf($)).toBeUndefined()
})

test('寫檔失敗（磁碟錯誤）：toast 說原因，原檔不變；同一個原因的 toast 不重複', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  w.files.set(HANDOFF_FILE, '# 交接\n')
  ctl.failWrite = HANDOFF_FILE
  await NOW_HANDOFF($, w)
  expect(w.files.get(HANDOFF_FILE)).toBe('# 交接\n')
  expect(w.toasts.filter(x => x.includes('狀態卡寫入失敗')).length).toBe(1)
  // 備份存在、卡片仍存在 store
  expect(w.get('card:C--proj')).toMatchObject({ status: '修好登入頁' })
})

test('標記壞掉：toast 只跳一次，紀錄每次都留；修好之後寫成功就恢復', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  const broken = '# 交接\n\n<!-- ctx-handoff:card rev=4 -->\n手寫到一半'
  w.files.set(HANDOFF_FILE, broken)
  await NOW_HANDOFF($, w)
  ctl.cardReply = JSON.stringify({ next: '再來一次' })
  await NOW_HANDOFF($, w)
  expect(w.toasts.filter(x => x.includes('找不到結尾標記')).length).toBe(1)
  expect(w.logs.filter(x => x.includes('找不到結尾標記')).length).toBe(2)
  expect(w.files.get(HANDOFF_FILE)).toBe(broken)
  w.files.set(HANDOFF_FILE, `${broken}\n<!-- /ctx-handoff:card -->\n`)
  ctl.cardReply = JSON.stringify({ next: '修好之後' })
  await NOW_HANDOFF($, w)
  const f = findCard(w.files.get(HANDOFF_FILE) ?? '')
  expect(f && f !== 'broken' && parseCard(f.text).next).toBe('修好之後')
})

for (const textOnly of [false, true]) {
  test(`BOM 與中文經由${textOnly ? '文字' : '位元組'}讀檔都原樣保留，寫出去的 UTF-8 解得回來`, async ($, on) => {
    const w = world(on, 100_000, 1_000_000, {}, [], 5)
    ctl.textOnly = textOnly
    const original = '\ufeff# 交接\r\n\r\n手寫的中文：試過不行的做法、決策\r\n'
    w.files.set(HANDOFF_FILE, original)
    await NOW_HANDOFF($, w)
    const text = w.files.get(HANDOFF_FILE) ?? ''
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text.startsWith('\ufeff# 交接\r\n\r\n<!-- ctx-handoff:card rev=1 -->\r\n')).toBe(true)
    expect(text.endsWith('\r\n\r\n手寫的中文：試過不行的做法、決策\r\n')).toBe(true)
    expect(w.files.get(BACKUP)).toBe(original)
    expect(text.includes('\ufffd')).toBe(false)
  })
}
