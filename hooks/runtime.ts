// 這個 process 內 register.ts 用的可變狀態（熱重載會清掉；要接得上的放 $.state）。集中成一個物件，不碰 $
import type { Timer } from 'claude-code'
import type { Change } from './notes'
import { freshWork } from './loops'
import type { Streak, Work } from './loops'
import { freshReply } from './lang'
import type { ReplyLang, ReplyState } from './lang'
import type { Digest } from './digest'

export const rt = {
  idle: undefined as Timer | undefined,
  refreshes: 0,
  // 互斥：同一時間只處理一個 handoff（不攔訊息）
  busy: false,
  // 在場交接進行中（門檻或 /handoff now）：使用者訊息先攔下，交接後一併送出
  presenting: false,
  held: [] as string[],
  // 這次在場交接開始的時間（undefined＝還沒開始計時），給攔訊息的提示與等整理的上限用
  presentStartedAt: undefined as number | undefined,
  // 背景整理的差異：依 session id 暫存，跟著下一則真正送進對話的訊息帶入
  pendingNotes: new Map<string, { changes: Change[]; file: string }>(),
  // 這個 process 送出失敗、尚未送達的 handoff（舊 session id）
  myPending: undefined as { sid: string } | undefined,
  pendingToasted: false,
  // 這個 process 最近產生的 handoff，/handoff resend 沒有未送達紀錄時用
  lastHandoff: undefined as { text: string } | undefined,
  retryAfter: undefined as { turns: number; at: number } | undefined,
  // classic.Stop 的最近快照；deferral 是目前延後 handoff 的原因
  snapshot: undefined as { tasks: number; oneShot: number; recurring: number } | undefined,
  deferral: undefined as string | undefined,
  deferToasted: false,
  seenKnown: new Set<string>(),
  distilling: false,
  // 上一次整理有沒有失敗（有回答但沒套用也算），給 /handoff distill 判斷
  distillFailed: false,
  // 守門的 store 鍵：工作區在 process 內不變，算一次就記住（熱重載會重算）
  guardsKeyCache: undefined as string | undefined,
  // 設定與介面語言：第一次用到時讀一次就記住（熱重載會重算）
  langReady: undefined as Promise<void> | undefined,
  // 防呆提醒：各工具最近一段連續失敗，與這一輪的改檔／驗證紀錄。熱重載會清掉，清掉只是少一次提醒
  streaks: new Map<string, Streak>(),
  work: freshWork() as Work,
  // 回覆語言提醒：目標語言快取（undefined＝還沒算；{ lang: undefined }＝不提醒）與提醒進度。熱重載會清掉，清掉只是少一次提醒
  replyTarget: undefined as { lang: ReplyLang | undefined } | undefined,
  reply: freshReply() as ReplyState,
  // 已經用 handoff 交接出去的 session（熱重載會清掉）：它的進度備忘不再提供，之後才寫完的整理也不存
  handed: new Set<string>(),
  // 狀態卡：更新排成一串（同時只有一個在讀寫檔）；這個 process 已備份過 _HANDOFF.md 的 session；
  // 已經用 handoff 更新過卡片的 session（之後才跑完的進度備忘不再蓋過它）。熱重載會清掉
  cardChain: Promise.resolve() as Promise<void>,
  cardBacked: new Set<string>(),
  cardFromHandoff: new Set<string>(),
  // 寫不進 _HANDOFF.md 的原因（衝突、標記壞掉、備份失敗）已經跳過 toast 的：同一個原因不重複跳，寫成功一次就清掉
  cardWarned: new Set<string>(),
  // 這個 process 看到的對話檔路徑（classic.Stop 帶的 transcript_path，確認是這個 session 的才用）
  transcript: undefined as { sid: string; path: string } | undefined,
  // 對話檔尾端摘要的快取：路徑、修改時間與大小都沒變就不重讀
  digestCache: undefined as { path: string; mtimeMs: number; size: number; digest: Digest } | undefined,
  // session.start 的 isInteractive：false（claude -p、SDK）沒有畫面可以問，不可逆指令確認直接放行
  interactive: undefined as boolean | undefined,
  // 最近一次 prompt.submit 的來源種類（composer、scheduled-trigger…）
  promptKind: undefined as string | undefined,
  // 最近一次壓縮前後的 token 數（after 可能沒有）；stops 是壓縮後已經判斷過幾次 Stop
  compact: undefined as { before: number | undefined; after: number | undefined; stops: number } | undefined,
}

// 重設程序內狀態（模組重新載入或測試重跑時）；distilling、distillFailed、presentStartedAt 沿用原本不重設的行為
export function resetRuntime() {
  rt.idle?.cancel()
  rt.idle = undefined
  rt.refreshes = 0
  rt.busy = false
  rt.presenting = false
  rt.held = []
  rt.pendingNotes.clear()
  rt.myPending = undefined
  rt.pendingToasted = false
  rt.lastHandoff = undefined
  rt.retryAfter = undefined
  rt.snapshot = undefined
  rt.deferral = undefined
  rt.deferToasted = false
  rt.seenKnown.clear()
  rt.guardsKeyCache = undefined
  rt.langReady = undefined
  rt.streaks.clear()
  rt.work = freshWork()
  rt.replyTarget = undefined
  rt.reply = freshReply()
  rt.handed.clear()
  rt.cardChain = Promise.resolve()
  rt.cardBacked.clear()
  rt.cardFromHandoff.clear()
  rt.cardWarned.clear()
  rt.transcript = undefined
  rt.digestCache = undefined
  rt.interactive = undefined
  rt.promptKind = undefined
  rt.compact = undefined
}
