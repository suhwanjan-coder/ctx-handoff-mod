// 進度備忘：「這個工作區現在停在哪」。背景整理順手產生一份（set_progress），存在 $.store，
// 下一段對話開頭只提供一次；暫時性的資料，不進經驗檔（純函式，不碰 $；讀寫 store 在 register.ts）
import { NOTE_TAG } from './notes'

export const PROGRESS_STATES = ['done', 'in_progress', 'blocked'] as const
export type ProgressState = (typeof PROGRESS_STATES)[number]
const STATE_LABEL: Record<ProgressState, string> = { done: '完成', in_progress: '進行中', blocked: '卡住了' }

// 超過這麼久的進度不再提供（對話已經隔了一天以上，狀態多半變了）
export const PROGRESS_MAX_AGE_MS = 24 * 60 * 60_000
// 每個欄位與整份的字數上限（中英文都算一個字）；整份加總不超過 PROGRESS_TOTAL_MAX
export const PROGRESS_TASK_MAX = 80
export const PROGRESS_FIELD_MAX = 120
export const PROGRESS_FILES_MAX = 5
export const PROGRESS_FILE_MAX = 80
export const PROGRESS_TOTAL_MAX = 600
// 記下「提供給哪幾段對話了」最多留幾筆
const OFFERED_KEEP = 5

export type ProgressFields = { task: string; state: ProgressState; verified?: string; next?: string; files: string[] }
// sid：產生它的 session；handed：這個 session 已經用 handoff 交接出去了（handoff 摘要已涵蓋，不再提供）；
// offered：已經提供給哪些 session（同一段對話 compaction 後不重複）
export type Progress = ProgressFields & { sid: string; at: number; handed?: true; offered?: string[] }

export const progressKey = (workspaceKey: string) => `progress:${workspaceKey}`

export const isProgressState = (v: unknown): v is ProgressState => typeof v === 'string' && (PROGRESS_STATES as readonly string[]).includes(v)
export const stateLabel = (s: ProgressState) => STATE_LABEL[s]

export const progressSize = (p: ProgressFields) =>
  [p.task, p.verified, p.next, ...p.files].reduce((n, s) => n + [...(s ?? '')].length, 0)

// 模型看的相對時間
export function agoText(ms: number) {
  const min = Math.round(Math.max(0, ms) / 60_000)
  if (min < 1) return '剛才'
  return min < 60 ? `${min} 分鐘前` : `${Math.round(min / 60)} 小時前`
}

// 這份進度的內容（一行）
const bodyText = (p: ProgressFields) =>
  `任務「${p.task}」、狀態${STATE_LABEL[p.state]}${p.verified ? `、最後驗證：${p.verified}` : ''}${p.next ? `、下一步：${p.next}` : ''}${p.files.length ? `、相關檔案：${p.files.join('、')}` : ''}`

export const progressBody = bodyText

// 這份紀錄（進度備忘或狀態卡）該不該提供給 sid 這段對話：
// 不是同一個 session 產生的（還在同一段對話）、沒有交接出去、一天內、這個 session 還沒提供過
export const canOffer = (rec: { sid: string; at: number; handed?: true; offered?: string[] }, sid: string, now: number) =>
  !(rec.sid === sid || rec.handed || rec.offered?.includes(sid) || now - rec.at > PROGRESS_MAX_AGE_MS)

// 新對話開頭要提供的文字（body 是停在哪的一行說明）
export const offerText = (ago: number, body: string) => [
  `${NOTE_TAG} 上一段對話（${agoText(ago)}）停在：${body}。`,
  '這是背景整理留下的簡短備忘，可能落後幾則訊息。使用者要接續時以此為起點，動手前先看實際的檔案與 git 狀態；使用者在做別的事就忽略，不要主動提起。',
].join('\n')

// 新對話開頭要提供的進度備忘；不該提供就回 undefined
export function progressOffer(p: Progress | undefined, sid: string, now: number) {
  if (!p || !canOffer(p, sid, now)) return undefined
  return offerText(now - p.at, bodyText(p))
}

// 提供過了：記下是給哪個 session 的
export const withOffered = <T extends { offered?: string[] }>(p: T, sid: string): T => ({ ...p, offered: [...(p.offered ?? []), sid].slice(-OFFERED_KEEP) })

// 給整理模型看的目前進度（超過一天的當作沒有）
export const progressForPrompt = (p: Progress | undefined, now: number) =>
  p && now - p.at <= PROGRESS_MAX_AGE_MS ? `${agoText(now - p.at)}：${bodyText(p)}` : '（無）'
