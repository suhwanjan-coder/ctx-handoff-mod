// 這個 session 的摘要（四行）與快取 TTL：從對話檔（JSONL）尾端的文字算出來（純函式，不碰 $；讀檔在 register.ts）。
// 對話檔一行一個 JSON：type 是 user／assistant／system…，message.content 是字串或區塊清單，
// assistant 的 message.usage.cache_creation 有 ephemeral_5m_input_tokens／ephemeral_1h_input_tokens（實機對話檔確認過欄位名稱）
import { taipeiStamp } from './card'

// 讀對話檔尾端的位元組數：先讀 64 KB，裡面湊不出一個使用者訊息或回覆時再放大
export const TAIL_BYTES = 64 * 1024
export const TAIL_BYTES_WIDE = 512 * 1024
// $.fs.read 單次最多讀 4 MiB；超過的對話檔改用指令讀尾端
export const FS_READ_LIMIT = 4 * 1024 * 1024 - 1024

type Block = { type?: string; text?: string; name?: string; input?: Record<string, unknown> }
export type Entry = {
  type?: string; timestamp?: string; isSidechain?: boolean; isMeta?: boolean; isCompactSummary?: boolean
  message?: {
    role?: string
    content?: string | Block[]
    usage?: { cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null; cache_creation_input_tokens?: number }
  }
}

// 快取 TTL：1h＝最近一次寫快取用的是 1 小時，5m＝只寫 5 分鐘，unknown＝尾端看不出來
export type Ttl = { kind: '1h' | '5m' | 'unknown'; at?: number }
export type Digest = { task: string; lastAt: number | undefined; tools: string[]; reply: string; ttl: Ttl }

// 尾端文字 → 條目。從檔案中間切開時第一行不完整，丟掉；壞行略過
export function parseTail(text: string, cutAtStart: boolean): Entry[] {
  const lines = text.split('\n')
  if (cutAtStart) lines.shift()
  const out: Entry[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const o = JSON.parse(line)
      if (o && typeof o === 'object') out.push(o as Entry)
    } catch {}
  }
  return out
}

const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const cut = (s: string, n: number) => {
  const chars = [...flat(s)]
  return chars.length > n ? `${chars.slice(0, n - 1).join('')}…` : chars.join('')
}

const blocksOf = (e: Entry): Block[] => (Array.isArray(e.message?.content) ? e.message.content : [])
const main = (e: Entry) => e.isSidechain !== true

// 使用者自己打的訊息：字串內容，或有文字區塊（只有工具結果的不算）；系統提醒與指令標籤開頭的不算
function userPrompt(e: Entry): string | undefined {
  if (e.type !== 'user' || !main(e) || e.isMeta || e.isCompactSummary || e.message?.role !== 'user') return undefined
  const c = e.message.content
  const text = typeof c === 'string' ? c : blocksOf(e).filter(b => b.type === 'text').map(b => b.text ?? '').join('\n')
  const t = text.trim()
  return t && !t.startsWith('<') ? t : undefined
}

const ARG_KEYS = ['command', 'file_path', 'notebook_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt']
export function toolBrief(b: Block): string {
  const name = b.name ?? 'tool'
  const input = b.input ?? {}
  const key = ARG_KEYS.find(k => typeof input[k] === 'string' && (input[k] as string).trim())
  return key ? `${name}(${cut(input[key] as string, 40)})` : name
}

export function ttlOf(entries: readonly Entry[]): Ttl {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e?.type !== 'assistant' || !main(e)) continue
    const cc = e.message?.usage?.cache_creation
    if (!cc) continue
    const m5 = cc.ephemeral_5m_input_tokens ?? 0
    const h1 = cc.ephemeral_1h_input_tokens ?? 0
    // 這一筆全部從快取讀（兩個都 0）看不出 TTL，往前找最近一筆有寫快取的
    if (h1 > 0 || m5 > 0) {
      const at = e.timestamp ? Date.parse(e.timestamp) : Number.NaN
      return { kind: h1 > 0 ? '1h' : '5m', ...(Number.isFinite(at) ? { at } : {}) }
    }
  }
  return { kind: 'unknown' }
}

export function digestOf(entries: readonly Entry[]): Digest {
  const mainEntries = entries.filter(main)
  const task = mainEntries.map(userPrompt).findLast((t): t is string => t !== undefined) ?? ''
  const stamps = entries.map(e => (e.timestamp ? Date.parse(e.timestamp) : Number.NaN)).filter(Number.isFinite)
  const tools = mainEntries.filter(e => e.type === 'assistant').flatMap(e => blocksOf(e).filter(b => b.type === 'tool_use')).slice(-3).map(toolBrief)
  const reply = mainEntries.filter(e => e.type === 'assistant')
    .map(e => blocksOf(e).filter(b => b.type === 'text').map(b => b.text ?? '').join('\n').trim())
    .findLast(t => t !== '') ?? ''
  return { task: cut(task, 80), lastAt: stamps.at(-1), tools, reply: cut(reply, 100), ttl: ttlOf(entries) }
}

// 尾端裡有沒有東西可以用：至少一個使用者訊息或助理回覆
export const hasContent = (d: Digest) => d.task !== '' || d.reply !== '' || d.tools.length > 0

// 對話檔讀不到時的後備：從 $.session.messages() 的列做（沒有時間與 TTL）
export function digestOfRows(rows: readonly { role: string; text: string; toolUses: readonly { tool: string; input: Record<string, unknown> }[] }[]): Digest {
  const task = rows.findLast(r => r.role === 'user' && r.text.trim() && !r.text.trim().startsWith('<'))?.text ?? ''
  const tools = rows.flatMap(r => (r.role === 'assistant' ? r.toolUses : [])).slice(-3).map(u => toolBrief({ name: u.tool, input: u.input }))
  const reply = rows.findLast(r => r.role === 'assistant' && r.text.trim())?.text ?? ''
  return { task: cut(task, 80), lastAt: undefined, tools, reply: cut(reply, 100), ttl: { kind: 'unknown' } }
}

export type DigestLabels = { task: string; last: string; tools: string; reply: string; none: string; unknownTime: string; sep: string }
// 摘要的四行。labels 給介面語言用（顯示）；給模型看的固定傳繁體中文那份
export function digestLines(d: Digest, l: DigestLabels): string[] {
  return [
    `${l.task}${l.sep}${d.task || l.none}`,
    `${l.last}${l.sep}${d.lastAt === undefined ? l.unknownTime : taipeiStamp(d.lastAt)}`,
    `${l.tools}${l.sep}${d.tools.length ? d.tools.join(' → ') : l.none}`,
    `${l.reply}${l.sep}${d.reply || l.none}`,
  ]
}

export const DIGEST_LABELS_ZH: DigestLabels = { task: '目前工作', last: '最後活動時間', tools: '最近 3 個工具呼叫', reply: '最後一句回覆', none: '無', unknownTime: '不明', sep: '：' }
