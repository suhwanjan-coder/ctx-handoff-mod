// 狀態卡：專案 _HANDOFF.md 裡 ctx-handoff 標記之間的一段（純函式，不碰 $；讀寫檔案與模型呼叫在 register.ts）。
// 卡片是資料，欄位標籤固定用繁體中文（和經驗檔的標題一樣，不隨介面語言翻譯）。
// 設計參考 SaM-runtime/claude-console（MIT）的 STATUS 卡片概念，程式自己寫
import { looksSecret } from './distill'
import type { ProgressFields } from './progress'
import { stateLabel } from './progress'

export const CARD_FILE = '_HANDOFF.md'
export const CARD_CLOSE = '<!-- /ctx-handoff:card -->'
// 標記要完全符合：開頭標記帶版次，結尾標記沒有。而且要「整行就是標記」（前後空白不算）、不在程式碼框裡才算數；
// 內文裡提到標記的句子、程式碼框裡的範例都不是卡片
const OPEN_RE = /<!-- ctx-handoff:card rev=(\d+) -->/
const OPEN_LINE = /^\s*<!-- ctx-handoff:card rev=(\d+) -->\s*$/
export const cardOpen = (rev: number) => `<!-- ctx-handoff:card rev=${rev} -->`

export const STATUS_MAX = 120
export const FIELD_MAX = 120
export const ITEM_MAX = 100
export const LIST_MAX = 5
// 欄位沒有內容時寫的字
const NONE = '無'

export type CardFields = {
  status: string; running: string; waiting: string; next: string; verified: string
  // 試過不行的做法、已定案的決定：各最多 LIST_MAX 條
  failed: string[]; decisions: string[]
}
// 存在 $.store 的那份：fields 加上是誰、何時、第幾版，與「提供給新對話」的記帳（同進度備忘）
export type Card = CardFields & { at: number; sid: string; rev: number; handed?: true; offered?: string[] }

export const emptyFields = (): CardFields => ({ status: '', running: '', waiting: '', next: '', verified: '', failed: [], decisions: [] })
export const cardKey = (workspaceKey: string) => `card:${workspaceKey}`

const cut = (s: string, n: number) => {
  const chars = [...s]
  return chars.length > n ? `${chars.slice(0, n - 1).join('')}…` : s
}
// 欄位值裡的 HTML 註解記號換成相近的字：欄位永遠不可能長出標記文字（否則一個欄位裡的 <!-- /ctx-handoff:card --> 會提早結束卡片，之後每次重寫都留下殘渣）
export const defang = (s: string) => s.replace(/<!--/g, '‹!--').replace(/-->/g, '--›')
const flat = (s: string) => defang(s.replace(/\s+/g, ' ')).trim()

// 台北時間（UTC+8，沒有日光節約）的 YYYY/MM/DD HH:mm
export function taipeiStamp(ms: number) {
  const d = new Date(ms + 8 * 60 * 60_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

// ---------- 輸出與解析 ----------

// 卡片本體（含前後標記）。換行一律先用 \n，套進檔案時再換成檔案原本的換行
export function renderCard(f: CardFields, meta: { at: number; sid: string; rev: number }): string {
  // 寫出去之前再清一次：欄位值不論從哪來（模型、摘要、手改後讀回來）都不能帶標記文字
  const one = (v: string) => defang(v) || NONE
  const list = (label: string, items: string[]) =>
    items.length ? [`- ${label}：`, ...items.map(i => `  - ${defang(i)}`)] : [`- ${label}：${NONE}`]
  return [
    cardOpen(meta.rev),
    '## 狀態卡',
    `- 更新：${taipeiStamp(meta.at)} · session ${meta.sid.slice(0, 8)} · rev ${meta.rev}`,
    `- 狀態：${one(f.status)}`,
    `- 執行中：${one(f.running)}`,
    `- 等使用者：${one(f.waiting)}`,
    `- 下一步：${one(f.next)}`,
    `- 驗證：${one(f.verified)}`,
    ...list('試過不行的做法', f.failed),
    ...list('決策', f.decisions),
    CARD_CLOSE,
  ].join('\n')
}

export type FoundCard = { start: number; end: number; rev: number; text: string }

// 逐行掃描：每行的起點、去掉行尾 \r 的文字，以及是不是在程式碼框裡（``` 或 ~~~，結尾要同一種字元、不少於開頭的個數）
type Line = { start: number; text: string; fenced: boolean }
function scanLines(text: string): Line[] {
  const out: Line[] = []
  let pos = 0
  let fence: { ch: string; len: number } | undefined
  for (const raw of text.split('\n')) {
    const start = pos
    pos += raw.length + 1
    const bare = raw.replace(/\r$/, '')
    const f = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(bare)
    const mark = f?.[1] ?? ''
    const tail = f?.[2] ?? ''
    if (fence) {
      if (f && mark[0] === fence.ch && mark.length >= fence.len && !tail.trim()) fence = undefined
      out.push({ start, text: bare, fenced: true })
    } else if (f && !(mark[0] === '`' && tail.includes('`'))) {
      fence = { ch: mark[0] ?? '`', len: mark.length }
      out.push({ start, text: bare, fenced: true })
    } else {
      out.push({ start, text: bare, fenced: false })
    }
  }
  return out
}

// 檔案開頭的 YAML front matter（--- … --- 或 --- … ...）結尾位置（不含換行）；沒有或沒收尾回 undefined
function frontMatterEnd(lines: Line[]) {
  if ((lines[0]?.text.replace(/^\ufeff/, '').trimEnd()) !== '---') return undefined
  for (const l of lines.slice(1)) if (l.text.trimEnd() === '---' || l.text.trimEnd() === '...') return l.start + l.text.length
  return undefined
}

// 找檔案裡的卡片：第一個「整行就是開頭標記」到它後面「整行就是結尾標記」（都不在程式碼框裡）。
// 有開頭沒結尾回 'broken'（不碰），沒有開頭回 undefined
export function findCard(text: string): FoundCard | 'broken' | undefined {
  const lines = scanLines(text)
  const at = lines.findIndex(l => !l.fenced && OPEN_LINE.test(l.text))
  if (at === -1) return undefined
  const open = lines[at] as Line
  const rev = Number(OPEN_LINE.exec(open.text)?.[1])
  const start = open.start + open.text.indexOf('<!--')
  const close = lines.slice(at + 1).find(l => !l.fenced && l.text.trim() === CARD_CLOSE)
  if (!close) return 'broken'
  const end = close.start + close.text.indexOf(CARD_CLOSE) + CARD_CLOSE.length
  return { start, end, rev, text: text.slice(start, end) }
}

// 卡片文字 → 欄位（手動改過也讀得回來；認不得的行略過）
export function parseCard(block: string): CardFields & { rev: number | undefined; updated: string } {
  const f = emptyFields()
  let rev: number | undefined
  let updated = ''
  let list: string[] | undefined
  const open = OPEN_RE.exec(block)
  if (open) rev = Number(open[1])
  for (const raw of block.split(/\r?\n/)) {
    const head = /^- (更新|狀態|執行中|等使用者|下一步|驗證|試過不行的做法|決策)：(.*)$/.exec(raw.trimEnd())
    if (head) {
      const [, label = '', value = ''] = head
      const v = value.trim() === NONE ? '' : value.trim()
      list = undefined
      if (label === '更新') updated = value.trim()
      else if (label === '狀態') f.status = v
      else if (label === '執行中') f.running = v
      else if (label === '等使用者') f.waiting = v
      else if (label === '下一步') f.next = v
      else if (label === '驗證') f.verified = v
      else if (label === '試過不行的做法') { list = f.failed; if (v) list.push(v) }
      else if (label === '決策') { list = f.decisions; if (v) list.push(v) }
      continue
    }
    const item = /^\s+- (.*)$/.exec(raw.trimEnd())
    if (item && list && list.length < LIST_MAX) list.push((item[1] ?? '').trim())
  }
  return { ...f, rev, updated }
}

export const hasCardContent = (f: CardFields) => Boolean(f.status || f.next)

// ---------- 套進檔案 ----------

export const hasBom = (text: string) => text.charCodeAt(0) === 0xfeff

// 檔案原本的換行：第一個換行是 \r\n 就是 CRLF
export const eolOf = (text: string) => {
  const i = text.indexOf('\n')
  return i > 0 && text[i - 1] === '\r' ? '\r\n' : '\n'
}

// 放卡片的位置（行尾，不含換行）：第一個 H1 行（# 開頭、不是 ##；程式碼框與 front matter 裡的不算）；
// 沒有 H1 但有 front matter，放在 front matter 結尾的 --- 後面；都沒有回 undefined（放最上面）
function anchorEnd(text: string) {
  const lines = scanLines(text)
  const fm = frontMatterEnd(lines)
  for (const l of lines) {
    if (fm !== undefined && l.start <= fm) continue
    if (!l.fenced && /^# \S/.test(l.text.replace(/^\ufeff/, ''))) return l.start + l.text.length
  }
  return fm
}

export type Applied = { text: string } | { error: 'broken' }

// 把卡片放進檔案：已有標記就只換標記之間（含標記本身，版次更新），沒有就放在第一個 H1 後面（沒有 H1 放最上面）。
// 標記以外的每個字元原樣保留；換行與 BOM 跟著檔案。block 用 \n 寫
export function applyCard(file: string, block: string): Applied {
  const eol = eolOf(file)
  const body = block.replace(/\n/g, eol)
  const found = findCard(file)
  if (found === 'broken') return { error: 'broken' }
  if (found) return { text: file.slice(0, found.start) + body + file.slice(found.end) }
  const at = anchorEnd(file)
  if (at === undefined) {
    const start = hasBom(file) ? 1 : 0
    const rest = file.slice(start)
    return { text: file.slice(0, start) + body + (rest === '' ? eol : eol + eol + rest) }
  }
  const rest = file.slice(at)
  // H1 後面已經空一行（或檔案到此為止）就不用再補換行
  const spaced = rest === '' || rest === eol || rest.startsWith(eol + eol) || rest.startsWith(`${eol}\r`)
  return { text: `${file.slice(0, at)}${eol}${eol}${body}${spaced ? '' : eol}${rest}` }
}

// /handoff card init：新檔只有標題和卡片
export const newCardFile = (block: string) => `# 交接\n\n${block}\n`

// ---------- 給模型 ----------

export function cardPrompt() {
  return [
    '你替一個專案維護「狀態卡」，讓接手的人或新對話一眼看出工作停在哪。依下面的資料更新卡片，只輸出一個 JSON 物件，不要其他文字：',
    '{"status":"…","running":"…","waiting":"…","next":"…","verified":"…","failed":["…"],"decisions":["…"]}',
    `- status：現在的狀態，一句話（${STATUS_MAX} 字內）`,
    `- running：還在跑或沒收尾的東西（背景程序、未 commit 或未存的改動）；沒有就寫「${NONE}」（${FIELD_MAX} 字內）`,
    `- waiting：等使用者回答或決定的事；沒有就寫「${NONE}」（${FIELD_MAX} 字內）`,
    `- next：下一步，只寫一個具體動作（${FIELD_MAX} 字內）`,
    `- verified：最後一次實際驗證的結果，寫跑了什麼、結果如何；沒驗證過就寫「${NONE}」，不要猜（${FIELD_MAX} 字內）`,
    `- failed：試過但不行的做法與原因，最多 ${LIST_MAX} 條、每條 ${ITEM_MAX} 字內；上一版仍然有效的保留，新的加進來，已過時的拿掉`,
    `- decisions：已定案的決定與理由，最多 ${LIST_MAX} 條、每條 ${ITEM_MAX} 字內；同樣保留、新增、拿掉`,
    '規則：',
    '- 沒變的欄位沿用上一版；不要編造資料裡沒有的事；不要寫金鑰、密碼或 token',
    '- 用資料裡使用者使用的語言；程式碼、指令、路徑與錯誤訊息維持原文',
  ].join('\n')
}

export function cardInput(prev: CardFields, digest: string, sourceLabel: string, source: string) {
  const prevText = hasCardContent(prev) || prev.failed.length || prev.decisions.length
    ? renderCard(prev, { at: 0, sid: '', rev: 0 }).split('\n').slice(3, -1).join('\n')
    : `（${NONE}）`
  return [
    '=== 上一版狀態卡 ===',
    prevText,
    '=== 對話摘要（這個 session 尾端） ===',
    digest || `（${NONE}）`,
    `=== ${sourceLabel} ===`,
    source,
    '=== 結束 ===',
    '',
    '依系統指示輸出 JSON。',
  ].join('\n')
}

// 模型回覆 → 欄位。缺的欄位沿用上一版；疑似金鑰的值丟掉（卡片會進專案檔案）；超過長度截短。不是 JSON 物件回 undefined
export function parseCardReply(text: string, prev: CardFields): CardFields | undefined {
  const a = text.indexOf('{')
  const b = text.lastIndexOf('}')
  if (a === -1 || b <= a) return undefined
  let o: Record<string, unknown>
  try {
    const parsed = JSON.parse(text.slice(a, b + 1))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    o = parsed as Record<string, unknown>
  } catch {
    return undefined
  }
  const one = (v: unknown, keep: string, n: number) => {
    if (typeof v !== 'string') return keep
    const s = flat(v)
    if (looksSecret(s)) return keep
    return s === NONE ? '' : cut(s, n)
  }
  const many = (v: unknown, keep: string[]) => {
    if (!Array.isArray(v)) return keep
    return v.filter((x): x is string => typeof x === 'string').map(flat).filter(x => x && x !== NONE && !looksSecret(x)).slice(0, LIST_MAX).map(x => cut(x, ITEM_MAX))
  }
  const out: CardFields = {
    status: one(o.status, prev.status, STATUS_MAX),
    running: one(o.running, prev.running, FIELD_MAX),
    waiting: one(o.waiting, prev.waiting, FIELD_MAX),
    next: one(o.next, prev.next, FIELD_MAX),
    verified: one(o.verified, prev.verified, FIELD_MAX),
    failed: many(o.failed, prev.failed),
    decisions: many(o.decisions, prev.decisions),
  }
  return hasCardContent(out) ? out : undefined
}

// ---------- 不呼叫模型的後備 ----------

// handoff 摘要的段落標題（中英文）；每個標題行之後到下一個標題行之前是它的內容
const SECTION_HEADS: { key: 'goal' | 'verified' | 'unverified' | 'failed' | 'running' | 'decisions' | 'files' | 'next' | 'questions'; re: RegExp }[] = [
  { key: 'goal', re: /目標|goal/i },
  { key: 'verified', re: /已驗證|verified/i },
  { key: 'unverified', re: /已做但未驗證|done but (?:un|not )verified|unverified/i },
  { key: 'failed', re: /試過但(?:失敗|不行)(?:的做法(?:與原因)?)?|tried (?:but )?(?:and )?failed|what (?:was|has been) tried|failed approaches/i },
  { key: 'running', re: /還在跑(?:或沒收尾)?(?:的東西)?|沒收尾(?:的東西)?|still running|loose ends|unfinished/i },
  { key: 'decisions', re: /已做的決定(?:與理由)?|決定與理由|decisions?/i },
  { key: 'files', re: /相關檔案(?:路徑與指令)?|relevant files|files and commands/i },
  { key: 'next', re: /下一步|next steps?/i },
  { key: 'questions', re: /待使用者回答(?:的問題)?|open questions?|questions? for the user/i },
]
// 標題行：行首（#、>、*、-、編號、粗體記號之後）就是標題字，後面接冒號、記號、空白或結束
const LEAD = /^[\s#>*_-]*(?:\d{1,2}[.)、．]\s*)?[*_]*\s*/
const HEAD_END = /^(?:$|[:：*_\s（(])/

export function handoffSections(text: string) {
  const buf: Partial<Record<(typeof SECTION_HEADS)[number]['key'], string[]>> = {}
  let cur: (typeof SECTION_HEADS)[number]['key'] | undefined
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const rest = line.replace(LEAD, '')
    let hit: { key: (typeof SECTION_HEADS)[number]['key']; len: number } | undefined
    for (const h of SECTION_HEADS) {
      const m = new RegExp(`^(?:${h.re.source})`, 'i').exec(rest)
      if (m && HEAD_END.test(rest.slice(m[0].length))) { hit = { key: h.key, len: m[0].length }; break }
    }
    if (hit) {
      cur = hit.key
      buf[cur] = []
      const inline = rest.slice(hit.len).replace(/^[\s*_]*[:：]?[\s*_]*/, '').trim()
      if (inline) buf[cur]?.push(inline)
      continue
    }
    if (cur && line.trim()) buf[cur]?.push(line.trim().replace(/^[-*•]\s+/, ''))
  }
  const out: Partial<Record<(typeof SECTION_HEADS)[number]['key'], string>> = {}
  for (const [k, v] of Object.entries(buf)) out[k as keyof typeof out] = flat(v.join(' '))
  return out
}

const goalOf = (handoff: string) => /^\s*HANDOFF\s*[:：]\s*(.+)$/im.exec(handoff)?.[1]?.trim()

// 沒有模型時：從 handoff 摘要的段落直接填狀態、下一步、驗證，其餘沿用上一版
export function cardFromHandoff(handoff: string, prev: CardFields): CardFields {
  const s = handoffSections(handoff)
  const clean = (v: string | undefined, n: number) => (v && !looksSecret(v) && v !== NONE ? cut(defang(v), n) : undefined)
  const none = (v: string | undefined) => (v === undefined ? undefined : v === '無' || /^none\.?$/i.test(v) ? '' : v)
  return {
    ...prev,
    status: clean(goalOf(handoff) ?? s.goal, STATUS_MAX) ?? prev.status,
    next: clean(none(s.next), FIELD_MAX) ?? prev.next,
    verified: none(s.verified) === '' ? '' : clean(s.verified, FIELD_MAX) ?? prev.verified,
    waiting: none(s.questions) === '' ? '' : clean(s.questions, FIELD_MAX) ?? prev.waiting,
    running: none(s.running) === '' ? '' : clean(s.running, FIELD_MAX) ?? prev.running,
  }
}

// 沒有模型時：從進度備忘填
export function cardFromProgress(p: ProgressFields, prev: CardFields): CardFields {
  const ok = (v: string | undefined, n: number) => (v && !looksSecret(v) ? cut(flat(v), n) : undefined)
  return {
    ...prev,
    status: ok(`${stateLabel(p.state)}：${p.task}`, STATUS_MAX) ?? prev.status,
    next: p.state === 'done' && !p.next ? '' : ok(p.next, FIELD_MAX) ?? prev.next,
    verified: ok(p.verified, FIELD_MAX) ?? prev.verified,
  }
}
