// 不可逆指令偵測：Bash／PowerShell 的指令裡有沒有刪整個資料夾、強制推送、丟棄未存改動、刪資料庫、發佈套件這類做了就回不去的操作（純函式，不碰 $；問使用者在 register.ts）。
// 做法：先把引號與跳脫拿掉、續行接起來、換行當成分隔符號，再用一組樣式掃整串文字。
// 因此 bash -c "…"、sh -c '…'、sudo …、xargs …、powershell／pwsh -Command "…"、cmd /c … 這些包裝裡面的指令，
// 和不包裝的指令走同一條路被掃到（包裝本身不算不可逆，不會單獨觸發）；PowerShell 的 -EncodedCommand 另外解碼再掃。
// 取捨：引號裡的字串也會被掃，echo "rm -rf /" 或 git commit -m "rm -rf" 會被攔下來問一次（寧可多問，不放過包裝裡的指令）。
//
// 樣式的寫法：
// - 起頭條件 (?<![\w.-])：前面不能是字母、數字、底線、點或連字號，所以 form -rf、--rm -rf（docker run --rm）不算；/bin/rm 前面是斜線，算
// - 「字」之間只用空格，字不含 ; & |，所以一個樣式不會跨過分隔符號或換行；字數有上限（WORDS），掃很長的指令（例如 heredoc）時工作量是線性的

export type Hit = { id: string; label: string }

// 掃兩種文字：lines 把換行當分隔符號（給指令樣式用）；flat 把換行當空格（給跨行的 SQL 用）
type Text = { lines: string; flat: string }
type Rule = { id: string; label: string; test: (t: Text) => boolean }

// 一個「字」：不含空白與指令分隔符號；字後面接空格。ANY：前面最多 40 個字（懶惰比對）
const WORDS = 40
const W = '[^\\s;&|]+'
const ANY = `(?:${W} +){0,${WORDS}}?`
const START = '(?<![\\w.-])'
const END = '(?=\\s|$)'
const re = (source: string, flags = 'i') => new RegExp(source, flags)

// git <任何全域選項> <子指令> …：子指令後面接空格才算（git push 單獨出現不算）
const git = (sub: string, rest: string, flags = 'i') => re(`${START}git +${ANY}${sub} +${rest}`, flags)

const RM_UNIX = re(`(?<!\\bgit )${START}rm(?:\\.exe)? +${ANY}(?:-[fiIdv]*[rR][fiIdvrR]*|--recursive)${END}`)
// -Recurse（含縮寫 -r、-rec…）；-Recurse:$false 是明講不遞迴，不算
const RECURSE = '-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?(?=[\\s:]|$)(?!:\\$?false)'
const PS_REMOVE = re(`(?<!\\bgit )${START}(?:remove-item|ri|rm|del|erase|rd|rmdir) +${ANY}${RECURSE}`)
const RECURSE_FLAG = re(`(?:^| )${RECURSE}`)
// 管線下游的刪除命令（一段的開頭，或 { } 裡面）：Get-ChildItem x -Recurse | Remove-Item
const PS_DELETE_STAGE = re('^(?:[%{(&] *)*(?:foreach(?:-object)? *\\{ *)?(?:remove-item|ri|rm|del|erase|rd|rmdir)(?=\\s|$)')
// 只有單獨的 -WhatIf 或 -WhatIf:$true 是預演；-WhatIf:$false 是真的執行
const WHATIF = re('(?:^| )-whatif(?:(?=\\s|$)|:\\$?true(?=\\s|$))')
// 一個陳述（; && || 分開）：Remove-Item 帶 -WhatIf 只是預演；上游任何一段有 -Recurse、下游接刪除命令也算
function removeItemHit(lines: string) {
  return lines.split(/;|&&|\|\|/).some(st => {
    if (WHATIF.test(st)) return false
    if (PS_REMOVE.test(st)) return true
    const stages = st.split('|').map(x => x.trim())
    return stages.some((stage, i) => i > 0 && PS_DELETE_STAGE.test(stage) && stages.slice(0, i).some(up => RECURSE_FLAG.test(up)))
  })
}
// del／rmdir／rd 的 /s（含 rd/s/q 這種沒有空格的寫法）
// /s 後面是空白或結尾，或是單字母開關（/q、/f）：/s/q 是開關，/s/foo 是路徑
const CMD_RD = re(`${START}(?:del|erase|rmdir|rd)(?: +${ANY})?/s(?=\\s|$|(?:/[a-z])+(?=\\s|$))`)
const ROBOCOPY_MIR = re(`${START}robocopy +${ANY}/(?:mir|purge)${END}`)
// robocopy /L 只列出會做什麼，不動檔案
const ROBOCOPY_LIST = re(`${START}robocopy +${ANY}/l${END}`)
const DOTNET_DELETE = re('\\[(?:system\\.)?io\\.directory\\]::delete\\([^)]*,\\s*\\$true')

const PUSH_FORCE = git('push', `${ANY}(?:--force(?:-with-lease|-if-includes)?(?:=\\S+)?|-[a-zA-Z]*f[a-zA-Z]*|\\+${W})${END}`)
// 刪遠端分支：--delete、-d，或 <remote> :<ref>
const PUSH_DELETE = git('push', `${ANY}(?:--delete|-[a-zA-Z]*d[a-zA-Z]*|:${W})${END}`)
const STASH_DROP = git('stash', `(?:drop|clear)${END}`)
const FILTER_BRANCH = re(`${START}git +${ANY}(?:filter-branch|filter-repo)${END}`)
const RESET_HARD = git('reset', `${ANY}--hard${END}`)
const CLEAN_FORCE = git('clean', `${ANY}(?:--force|-[a-zA-Z]*f[a-zA-Z]*)${END}`)
// git clean 帶 -n／--dry-run 只是預演
const CLEAN_DRY = git('clean', `${ANY}(?:--dry-run|-[a-zA-Z]*n[a-zA-Z]*)${END}`)
const BRANCH_DELETE = git('branch', `${ANY}(?:-[a-zA-Z]*D[a-zA-Z]*|-[a-zA-Z]*(?:df|fd)[a-zA-Z]*|--delete +${ANY}--force|--force +${ANY}--delete)${END}`, '')
const CHECKOUT_ALL = git('checkout', `(?:${ANY}-- +)?\\.${END}`)
const RESTORE_ALL = git('restore', `${ANY}\\.${END}`)
// git restore --staged . 只是取消暫存，不動工作區（同時帶 --worktree／-W 才算）
const RESTORE_STAGED_ONLY = git('restore', `${ANY}(?:--staged|-S)${END}`, '')
const RESTORE_WORKTREE = git('restore', `${ANY}(?:--worktree|-W)${END}`, '')

const DROP_SQL = re('\\bdrop\\s+(?:table|database|schema)\\b')
const TRUNCATE_SQL = re('\\btruncate\\s+table\\b')
// DROP／TRUNCATE 只在指令真的呼叫 SQL 用戶端時才算（grep、Select-String、寫 .sql 檔的 heredoc 不算）
const SQL_CLIENT_CMD = re(`${START}(?:sqlite3?|psql|mysql|mariadb|mysqlsh|sqlcmd|invoke-sqlcmd|duckdb|pgcli|clickhouse-client|bq)(?:\\.exe)?(?=[\\s;|&)]|$)`)
// python -c／node -e 裡用 SQL 函式庫執行（import sqlite3、sqlite3.connect、require('mysql2')…）；兩邊都要是單字邊界
const INTERPRETER = re(`${START}(?:python[\\d.]*|py|node)(?:\\.exe)?(?=\\s|$)`)
const SQL_LIB = re('(?<![\\w])(?:sqlite3|psycopg2?|pymysql|mysql\\.connector|mysql2|better-sqlite3|duckdb)(?![\\w])')
const SQL_CLIENT = { test: (t: string) => SQL_CLIENT_CMD.test(t) || (INTERPRETER.test(t) && SQL_LIB.test(t)) }
// python 腳本裡的 shutil.rmtree
const RMTREE = re('\\bshutil\\.rmtree\\b')
const PYTHON = re(`${START}(?:python[\\d.]*|py)(?:\\.exe)?${END}`)
const PUBLISH = re(`${START}(?:npm|pnpm|yarn|bun) +${ANY}(?:publish|unpublish)${END}`)
const PUBLISH_DRY = re(`--dry-run${END}`)
const FORMAT_DRIVE = re(`${START}format(?:\\.com|\\.exe)? +[a-z]:`)
const FORMAT_VOLUME = re(`${START}(?:format-volume|clear-disk)\\b`)

const RULES: Rule[] = [
  { id: 'rm-r', label: 'rm -r', test: t => RM_UNIX.test(t.lines) },
  { id: 'remove-item-recurse', label: 'Remove-Item -Recurse', test: t => removeItemHit(t.lines) },
  { id: 'del-s', label: 'del／rmdir /s', test: t => CMD_RD.test(t.lines) },
  { id: 'robocopy-mir', label: 'robocopy /MIR', test: t => ROBOCOPY_MIR.test(t.lines) && !ROBOCOPY_LIST.test(t.lines) },
  { id: 'dotnet-delete', label: '[IO.Directory]::Delete(…, $true)', test: t => DOTNET_DELETE.test(t.lines) },
  { id: 'rmtree', label: 'shutil.rmtree', test: t => RMTREE.test(t.flat) && PYTHON.test(t.flat) },
  { id: 'push-force', label: 'git push --force', test: t => PUSH_FORCE.test(t.lines) },
  { id: 'push-delete', label: 'git push --delete', test: t => PUSH_DELETE.test(t.lines) },
  { id: 'stash-drop', label: 'git stash drop／clear', test: t => STASH_DROP.test(t.lines) },
  { id: 'filter-branch', label: 'git filter-branch', test: t => FILTER_BRANCH.test(t.lines) },
  { id: 'reset-hard', label: 'git reset --hard', test: t => RESET_HARD.test(t.lines) },
  { id: 'clean-force', label: 'git clean -f', test: t => CLEAN_FORCE.test(t.lines) && !CLEAN_DRY.test(t.lines) },
  { id: 'branch-D', label: 'git branch -D', test: t => BRANCH_DELETE.test(t.lines) },
  { id: 'checkout-all', label: 'git checkout -- .', test: t => CHECKOUT_ALL.test(t.lines) },
  { id: 'restore-all', label: 'git restore .', test: t => RESTORE_ALL.test(t.lines) && (!RESTORE_STAGED_ONLY.test(t.lines) || RESTORE_WORKTREE.test(t.lines)) },
  { id: 'drop-sql', label: 'DROP TABLE／DATABASE', test: t => DROP_SQL.test(t.flat) && SQL_CLIENT.test(t.flat) },
  { id: 'truncate-sql', label: 'TRUNCATE TABLE', test: t => TRUNCATE_SQL.test(t.flat) && SQL_CLIENT.test(t.flat) },
  { id: 'publish', label: 'npm／pnpm publish', test: t => PUBLISH.test(t.lines) && !PUBLISH_DRY.test(t.lines) },
  { id: 'format', label: 'format', test: t => FORMAT_DRIVE.test(t.lines) || FORMAT_VOLUME.test(t.lines) },
]

// 引號、跳脫、反引號拿掉，續行（行尾的 \ 或 PowerShell 的反引號）接起來，空白壓成一個空格：
// 包在 "…"、'…'、`…` 裡的指令就和直接寫的一樣。lines 的換行變成「 ; 」，樣式不會跨行；flat 的換行變成空格
// 引號裡的 ; & | 若是資料（路徑、字串）就換成不是分隔符號的字元，免得 "D:\R&D" 把指令切斷；
// 引號是包裝的程式碼（-c、-Command、/c、-e、eval 後面那一段）就保持原樣，裡面的 ; && | 照樣是分隔符號。沒有收尾的引號當作普通字元
const MASK: Record<string, string> = { ';': '\ue000', '&': '\ue001', '|': '\ue002' }
const CODE_FLAG = /^(?:-[a-z]*[ce]|-command|-commandwithargs|-encodedcommand|\/[ck]|eval)$/i
function maskQuoted(cmd: string) {
  let out = ''
  let i = 0
  while (i < cmd.length) {
    const ch = cmd[i] as string
    if (ch !== '"' && ch !== "'") { out += ch; i++; continue }
    let j = i + 1
    while (j < cmd.length && cmd[j] !== ch) j += ch === '"' && cmd[j] === '\\' ? 2 : 1
    if (j >= cmd.length) { out += ch; i++; continue }
    const prev = /(\S+)\s*$/.exec(out)?.[1] ?? ''
    const body = cmd.slice(i + 1, j)
    out += ch + (CODE_FLAG.test(prev) ? body : body.replace(/[;&|]/g, c => MASK[c] ?? c)) + ch
    i = j + 1
  }
  return out
}

export function normalize(command: string): Text {
  const base = maskQuoted(command)
    .replace(/\\\r?\n/g, ' ')
    .replace(/`\r?\n/g, ' ')
    .replace(/\\(["'`])/g, '$1')
    .replace(/["'`]/g, ' ')
  const squeeze = (s: string) => s.replace(/[ \t\f\v]+/g, ' ').trim()
  return { lines: squeeze(base.replace(/\r?\n/g, ' ; ')), flat: squeeze(base.replace(/\s+/g, ' ')) }
}

// PowerShell -EncodedCommand／-enc／-e：Base64 的 UTF-16LE。解不出來就略過
const ENCODED = re(`(?:powershell|pwsh)(?:\\.exe)? +${ANY}-(?:e|ec|enc|encodedcommand) +([A-Za-z0-9+/]{16,}={0,2})`)
function decodeEncoded(command: string): string | undefined {
  const b64 = ENCODED.exec(command.replace(/\r?\n/g, ' ; '))?.[1]
  const decode = (globalThis as { atob?: (s: string) => string }).atob
  if (!b64 || typeof decode !== 'function') return undefined
  try {
    const bin = decode(b64)
    let out = ''
    for (let i = 0; i + 1 < bin.length; i += 2) out += String.fromCharCode(bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8))
    return out
  } catch {
    return undefined
  }
}

// 要掃的文字：原指令，加上 -EncodedCommand 解開的內容（可以再包一層）
export function variants(command: string): Text[] {
  const out = [normalize(command)]
  let cur = command
  for (let i = 0; i < 3; i++) {
    const decoded = decodeEncoded(cur)
    if (!decoded) break
    out.push(normalize(decoded))
    cur = decoded
  }
  return out
}

export const GUARDED_TOOLS = new Set(['Bash', 'PowerShell'])

// 這個工具呼叫的指令有沒有不可逆操作；沒有回 undefined
export function irreversible(tool: string, command: unknown): Hit | undefined {
  if (!GUARDED_TOOLS.has(tool) || typeof command !== 'string' || !command.trim()) return undefined
  for (const text of variants(command)) {
    const rule = RULES.find(r => r.test(text))
    if (rule) return { id: rule.id, label: rule.label }
  }
  return undefined
}
