# ctx-handoff 使用指南

[English](guide.md)

ctx-handoff 的完整說明：每個功能怎麼運作、所有設定與指令、花費、送出與儲存的資料、支援的環境、限制，以及疑難排解與移除。概覽請看 [README](../README.zh-TW.md)。

## 功能

### 對話快滿時自動交接

context 到 600k token（較小的視窗是 80%）時，會等 Claude 做完這一輪、背景工作與子代理都結束，再寫交接摘要、清空對話，把摘要送進新對話。新對話先說明它理解的進度，再等你指示。

摘要會分開「驗證過的」（跑過測試、看過結果）與「只改了還沒驗證的」，列出失敗過的做法免得重試，記下還在跑或還沒存的東西，保留你在過程中訂的限制（例如「推送前先問我」），最後給一個具體的下一步。

- 背景工作一直不結束（例如開發伺服器）也不會卡住：用量達到「門檻 + 150k token」與「視窗的 90%」兩者較小值時，在下一次 Stop 照樣交接。一次性排程也會延後交接，循環排程不會。
- 交接期間你打的訊息不會遺失，會和摘要一起送進新對話。附件無法暫存，會提示你重新貼上。
- `/handoff now` 立刻交接；`/handoff dry` 只產生摘要並顯示花費，不清空。

### 離開時保持快取

閒置約 55 分鐘後送一個很小的請求，讓對話快取不過期，最多 3 次（約 4 小時）。這些請求之後的下一次閒置計時到期，會存好交接摘要但不清空。關掉刷新、把 `max_refresh` 設成 0，或偵測到 5 分鐘快取時，略過刷新，第一次閒置計時到期就存摘要。不到 `min_tokens` 的對話略過以上所有閒置動作。你回來時，第一則訊息會先攔下讓你選：`/handoff resume`（簡寫 `/hr`）用摘要開新對話，`/handoff continue`（簡寫 `/hc`）留在原本的對話；再送一則訊息也等於留在原對話，內容不同時會把先前攔下的訊息一起送出。

### 專案筆記

<img src="distill-demo.gif" width="300" alt="示範：同一件事講了三次，開新對話後被忘記；ctx-handoff 把它整理成一條規則，下一段對話就記得了">

你糾正或說明過的事，會整理進每個專案一份的筆記檔。它是可以直接編輯的 Markdown：`~/.claude/projects/<專案路徑>/memory/ctx-handoff.md`。**預設不會把筆記帶進你的對話**：它們留在檔案和面板裡，背景整理照常跑（守門和進度都靠它）。打開 `inject_notes` 才會照下面說的帶入。

- **記憶**：偏好、修正、事實與位置。模型新增偏好與修正時必須附上對得上的使用者原話；讀檔帶入時不重驗原話。`inject_notes` 打開時，偏好與修正帶入標題、做法與理由，不帶根據；事實與位置只帶標題。事實與位置超過 30 天沒再被證實就封存（不帶入、不刪除），沒有附日期根據的條目不封存。
- **規則**：一再出現的做法，例如「Bash 路徑用正斜線（3 次）」。`inject_notes` 打開時，出現兩次以上才帶入，依次數排序，最多 15 條。
- **流程**：你讓 Claude 重複做過的多步驟工作，例如「發版：改版號 → 更新 changelog → 打 tag → 發 GitHub release」。從不帶入，只留在筆記檔裡。

筆記在每 30 則你的訊息、閒置 55 分鐘、交接前，或打 `/handoff distill` 時更新。有上次整理的錨點時，只送之後新增的對話；找不到錨點時，改用整段對話，仍受下方文字上限限制。預設模型是 Sonnet 5.5（effort low）。不到 30k token 的對話略過定期與閒置整理。手動整理與交接前整理不受 `min_tokens` 限制，背景整理關閉時仍可手動執行。上次整理後沒有新回合，就不會再整理。疑似金鑰或密碼的內容會由樣式檢查丟掉，但不保證偵測到每一種機密。狀態列會倒數（「再 18 則整理筆記」）。

編輯模型產生的筆記時，請保留格式：記憶標題要求 40 字內，超過 60 字丟棄；做法與理由各 100 字、根據 200 字、原話 120 字。規則名稱 40 字、規則內容 150 字。每條記憶保留最近 3 筆根據。流程名稱 40 字、時機 100 字、步驟 2–8 步且每步 80 字；提示要求模型提至少 3 步的流程。這些檢查針對模型輸出，不限制任意手動編輯。

ctx-handoff 不會寫你專案裡的 `CLAUDE.md`、`AGENTS.md` 或 skill 檔案。它會維護自己的筆記檔、下方說明的狀態卡、兩者的備份與自己的 store。

### 告訴新對話停在哪

你自己 `/clear`、Claude Code 當掉，或單純開新對話時，新對話不知道上一段做到哪。所以每次整理筆記時，也會為這個資料夾留一份簡短的進度：在做什麼、完成了／進行中／卡住、最後通過的檢查、下一步，以及最多 5 個關鍵檔案。它和筆記在同一個請求裡完成。

同一個資料夾的下一段對話，會在 24 小時內被提醒一次：「上一段對話（2 小時前）停在……」。你要接著做，Claude 就從那裡開始；你在做別的事，它就不理會。已經自動交接過的對話不會收到，因為摘要已經涵蓋了。專案有狀態卡（下一節）時，改告訴新對話卡片上的狀態與下一步，所以你在 `_HANDOFF.md` 手動改過的那一行，新對話聽到的就是那一行。

### 在 `_HANDOFF.md` 維護狀態卡

每次交接之後（自動、`/handoff now`，或離席時存的那份），以及背景整理有進度備忘時，ctx-handoff 會更新專案根目錄 `_HANDOFF.md` 裡的一塊：根目錄是你啟動 session 的資料夾，從 git worktree 啟動時是主工作樹。內容沒變就不重寫，版次與時間也不變。`/handoff dry` 不更新卡片。這一塊有更新時間（台北時間）、session 與版次、狀態、執行中的東西、等你回答的事、下一步、最後一次驗證、試過不行的做法（最多 5 條）與決策（最多 5 條）。

- 只換 `<!-- ctx-handoff:card rev=N -->` 與 `<!-- /ctx-handoff:card -->` 之間的內容。標記要整行就是標記、而且不在程式碼框裡才算，所以內文提到標記的句子、程式碼框裡的範例都不會被動到，卡片也不會放進或放到 YAML front matter 上面。第一次放在第一個 `# ` 標題後面，沒有標題就放最上面。你的文字、它的換行（CRLF 或 LF）與 BOM 都保持原樣。
- 寫入前一刻再量一次檔案的修改時間與大小。這中間你存過檔，就重讀一次再試；又變了就放棄並提示。最後檢查與寫入之間仍有短暫空隙，並非原子更新。模型準備更新期間你改了卡片本身的話，這次更新作廢，下一次從你改過的版本接著來。位元組讀取會拒絕非 UTF-8 檔案（Big5、cp950、UTF-16）；只能讀文字時，後備檢查只能看替代字元與 NUL。編碼問題每個 session 提示一次。
- 每個 session 第一次寫之前，先把檔案複製到 `.ctx-handoff-backup/_HANDOFF.md.bak`。有史以來第一次的備份另存成 `_HANDOFF.md.first.bak`，永遠不覆蓋。
- 沒有 `_HANDOFF.md` 時不會建立。卡片只留在 ctx-handoff 內部，`/handoff` 會說明；打 `/handoff card init` 會建立檔案，內容是 `# 交接` 標題加狀態卡。

卡片文字由一個低 effort 的請求產生（`card_model`，預設用整理筆記的模型），輸入是上一版卡片、session 摘要，以及交接摘要或進度備忘，不送整段對話。失敗的話，狀態與下一步直接從摘要填入。設定：`card`。

### session 摘要與快取 TTL

`/handoff` 會用四行顯示這個 session 的摘要：目前工作、最後活動時間、最近 3 個工具呼叫、最後一句回覆。先讀對話檔最後 64 KB，缺少工作、內容或 TTL 時放大到 512 KB。檔案超過 4 MiB 減 1 KiB 時用 `tail`（沒有就用 PowerShell）讀尾端；較小的檔案整份讀入後在記憶體截取。結果依路徑、修改時間與大小快取。讀不到檔案時，退回訊息列，時間與 TTL 不明。狀態卡更新也拿同一份摘要。

同一段尾端還看得出這個 session 寫的是 1 小時還是 5 分鐘的快取。只寫 5 分鐘快取的 session 撐不到 55 分鐘，保持快取的請求幫不上忙，所以略過，改存離席摘要；`/handoff` 會顯示偵測到的 TTL 並說明原因。尾端看不出來時，保持快取照原本的方式做。

### 壓縮

對話被壓縮時（`/compact` 或自動），會提示壓縮前後的大小（「已壓縮 214k → 31k」），閒置計時重新開始。之後的 Stop 不拿還是壓縮前的 context 讀數判斷，最多略過 3 次，所以自動交接不會被過時的數字觸發。

### 不可逆指令

Bash 或 PowerShell 要執行回不去的指令前，會先問你「允許」或「拒絕」。拒絕或關掉詢問框，指令就不執行，並告訴 Claude。你核准的守門先比對。

- 會問的：`rm -r` 與 `rm -rf`、`Remove-Item -Recurse`、`rmdir /s`、`del /s`、`git push --force`、`-f` 與 `--force-with-lease`、`git reset --hard`、`git clean -f`、`git branch -D`、`git checkout -- .`、`git restore .`、`git push --delete`、`git stash drop`、`git filter-branch`、`robocopy /MIR`、`[IO.Directory]::Delete`、`shutil.rmtree`、把 `-Recurse` 的清單接到 `Remove-Item`（即使只寫了一個檔名也會問）、由 `psql` 這類 SQL 用戶端執行的 `DROP TABLE`、`DROP DATABASE` 與 `TRUNCATE TABLE`、`npm publish`、`pnpm publish` 和 `format D:`。包在 `bash -c`、`sh -c`、`sudo`、`xargs`、`powershell -Command`、`cmd /c` 和 PowerShell 的 `-EncodedCommand` 裡面的指令也會檢查。
- 不會問的：`rm file.txt`、`git push`、`grep -rf`、`git clean -n`、`git restore --staged .`、`npm publish --dry-run`、`Remove-Item -WhatIf`（`-WhatIf:$false` 不算）、`robocopy /L`，以及沒有 SQL 用戶端執行的 SQL 文字，例如 `grep` 的搜尋字串。當成文字出現的指令，例如 `echo "rm -rf /"`，會問一次：引號裡的字也會掃，藏在引號裡的指令才不會漏掉。

沒有畫面可以問時（`claude -p`、SDK，或沒有接上任何畫面），指令照常執行，只留一行紀錄，排程工作才不會卡住。有畫面但沒人回答時，詢問 120 秒後逾時，指令被拒絕，並告訴 Claude 改用可復原的做法或之後再請使用者確認；排程或 `/loop` 觸發的回合不問，直接拒絕。Monitor 和 MCP 工具執行的指令不在檢查範圍。設定：`command_guard`。

### 防呆提醒

都是給 Claude 的一句話，不會擋你的工具。預設全開。

- **重複失敗**：同一個工具連續兩次因同樣原因失敗時，請 Claude 先找出原因、換個做法，不要原樣重試。
- **說完成卻沒驗證**：Claude 這一輪改過程式檔、之後沒跑任何測試、建置或檢查就說完成時，請它先驗證一次並附上結果，或說明哪些沒辦法驗證。只改文件不算。Claude Code 會把這則顯示成「Stop hook feedback」，也可能標成 Stop hook error；那就是這個提醒，不是出錯。
- **回覆語言**：Claude 的說明大部分不是你用的語言（繁體中文、簡體中文、英文、日文）時，提醒它一次。程式碼、指令、路徑、連結和很短的句子不算，所以中文夾英文術語沒問題。你刻意要求別的語言時（例如翻譯）也會提醒一次。

### 守門

規則出現 3 次以上，而且還沒有任何狀態的守門時，`/handoff guard suggest` 會請整理模型草擬一條工具呼叫參數的檢查，可設成擋下或提醒。例如比對 `git push`，但同一指令含有 `preflight` 時放行。它不追蹤先前的呼叫，也不知道測試是否通過。草稿必須通過格式及違規／正確範例檢查，面板也會顯示對已記錄呼叫的試比對結果。**你核准之前完全不會生效。** 提醒型會執行工具再附上提醒，擋下型會先阻止執行。無效的正規表達式不會命中。

### 面板

`/handoff panel` 在輸入框上方開面板，有五個分頁：待核准的守門、記憶、規則與流程、最近一次整理改了什麼，以及設定。記憶分頁顯示最新 8 條未封存項目與全部封存項目，「留下」會以今天的日期證實封存條目。刪除筆記要按兩次確認，並會先備份原檔；刪除守門只按一次。守門有核准／停用、刪除、展開按鈕，擋下／提醒模式用下方指令切換。直接點按鈕，或按 ctrl+x tab 再按 1–5 切分頁。再打一次指令或按關閉即可關閉。

<img src="panel.png" width="560" alt="輸入框上方的面板，停在規則分頁：上方是守門、記憶、規則、最近整理等分頁，下面列出各條規則（例如宣布發版前先確認部署版本）與出現次數">

## 設定

所有設定都在面板的「設定」分頁調整，不在 `/config` 裡。數字用 `−`／`＋` 一格一格調，開關與選項按「切換」。每一列標出值從哪來（面板、settings.json 或預設），按「展開」看說明，「還原」會拿掉面板的值。改了之後目前的 session 馬上生效，其他開著的 session 在下一則訊息套用。設定所有專案共用，更新 plugin 不會被覆蓋。

| 設定 | 預設 | 意思 |
|---|---|---|
| `threshold` | `600000` | 數字，50000–2000000；每格 50000。交接取此值與 `window × ratio` 的較小值 |
| `window_ratio` | `0.8` | 數字，0.3–0.95；每格 0.05。context 視窗的乘數 |
| 離開時保持快取 | 開 | 也可用 `/handoff refresh on\|off` |
| `idle_minutes` | `55` | 數字，5–59；每格 5。閒置幾分鐘後保持快取；快取只有 5 分鐘時略過 |
| `max_refresh` | `3` | 數字，0–10；每格 1。每段閒置最多保持幾次，之後改存摘要 |
| 專案筆記 | 開 | 也可用 `/handoff distill on\|off` |
| `distill_every` | `30` | 數字，5–200；每格 5。每幾則你的訊息整理一次筆記 |
| `min_tokens` | `30000` | 數字，0–500000；每格 10000。比這小的對話不保持快取、不存離席摘要、不做定期與閒置整理 |
| `notes_model` | `claude-sonnet-5-5` | 整理筆記用的模型：Sonnet 5.5 或 Opus 5.5 |
| `inject_notes` | 關 | 把筆記檔的內容帶進新對話與下一則訊息 |
| `card` | 開 | 在 `_HANDOFF.md` 維護狀態卡 |
| `card_model` | 空白 | 狀態卡用的模型；空白代表和 `notes_model` 一樣 |
| `resume_hint` | 開 | 告訴新對話上一段停在哪 |
| `retry_nudge` | 開 | 重複失敗提醒 |
| `done_check` | 開 | 說完成卻沒驗證的提醒 |
| `command_guard` | 開 | 執行不可逆的 Bash 與 PowerShell 指令前先問 |
| `reply_language` | `auto` | 回覆語言提醒：`auto`、`off`、`zh-TW`、`zh-CN`、`en` 或 `ja` |
| `language` | `auto` | 狀態列、提示與面板的語言：`auto`、`en` 或 `zh-TW` |

`auto` 跟著 Claude Code 自己的 `language` 設定。回覆語言提醒在未設定、認不得、或只寫「中文」分不出繁簡時不提醒。介面語言遇到「中文」會選繁體中文；只有未設定或留白才看系統語系，明確的非中文值會選英文。筆記與摘要要求用你在對話裡使用的語言撰寫，筆記標題與狀態卡欄位標籤固定為繁體中文。

開關設定用布林值，模型與語言設定用字串。兩個模型設定都可在 `settings.json` 填清單外的名稱；面板只輪替 Sonnet 5.5 與 Opus 5.5，`card_model` 另有空白選項。數字會拉回範圍內，不會對齊面板的間距；`max_refresh` 與 `distill_every` 會四捨五入為整數。型別錯誤或限定清單外的選項使用預設值。「離開時保持快取」與「專案筆記」是獨立的 store 開關，不是 `userConfig` 的鍵。

**門檻怎麼選**：一般經驗是模型品質在 200k～300k token 左右開始下滑。預設 600k 是為了少交接幾次；如果交接前 Claude 已經開始變差，就調低它。

**改寫在檔案裡。** VS Code 擴充功能看不到面板；在那裡，或你想把設定放在檔案裡時，寫進 `~/.claude/settings.json`（用 clone 載入的話，鍵是 `ctx-handoff@inline`）。面板設過的值優先於檔案。

```json
"pluginConfigs": { "ctx-handoff@ctx-handoff-mod": { "options": { "threshold": 400000, "reply_language": "zh-TW" } } }
```

## 指令

平常用不到。`/handoff` 已經被你自己的指令或 skill 佔用時，會改成 `/ctx-handoff`。

| 指令 | 用途 |
|---|---|
| `/handoff` | context 用量、哪些功能開著、最近的進度、session 摘要、快取 TTL、狀態卡與錯誤 |
| `/handoff status`、`/handoff 狀態` | 和 `/handoff` 相同的狀態 |
| `/handoff panel` | 開關面板 |
| `/handoff now` | 立刻交接（會清空對話） |
| `/handoff dry` | 產生交接摘要並顯示花費，不清空 |
| `/handoff distill` | 立刻整理專案筆記 |
| `/handoff resume`／`continue` | 離開回來後：用摘要開新對話，或留在原對話；簡寫 `/hr`／`/hc`，也可以打 `/handoff r`／`c` |
| `/handoff 接續`、`/handoff 繼續` | 分別等於 resume 與 continue |
| `/handoff resend` | 交接摘要沒送到時重送 |
| `/handoff refresh on\|off`、`distill on\|off` | 開關保持快取或專案筆記 |
| `/handoff card` | 顯示狀態卡在哪、寫了什麼；`card init` 建立 `_HANDOFF.md` |
| `/handoff guard` | 列出守門；`suggest` 草擬新的，`on\|off\|drop N` 核准、停用或刪除，`mode N deny\|remind` 切換擋下或提醒 |

`/hc` 或 `/hr` 的名稱被其他指令使用時，各自略過，長寫法仍可用。`/handoff resend` 只用目前 process 的未送達或最近一份交接（包含試產），不會再次清空，也不會搜尋其他 session 的交接存檔。

狀態固定包含 context／門檻／視窗、刷新開關／次數／計時、離席與最近交接、筆記、守門、四行 session 摘要及防呆設定。以下三行一律顯示：快取 TTL（1 小時、5 分鐘或不明）、狀態卡（關閉、未產生、只存在內部或檔案路徑）、不可逆指令確認（on／off）。5 分鐘 TTL 的說明依刷新開關而異。進度有紀錄才顯示，即使已過期或提示關閉仍會顯示；失敗只有在沒有較新的成功紀錄時顯示。未送達交接、延後與背景工作數量需要對應的執行中狀態。記憶分層只在 `inject_notes` 開啟時顯示，流程數只在非零時顯示。

## 花費、隱私與權限

**花費。** 全部用你自己的 Claude Code 登入執行，和其他請求一樣算進你的用量。

- 交接摘要：一個請求讀整段對話並寫摘要，快取使用與耗時依 session 而異。筆記與卡片啟用且符合更新條件時會有額外請求。
- 保持快取：一個很小的請求，從快取讀整段對話，約一般輸入價的十分之一；每段閒置最多 3 次。
- 筆記：送新增對話；找不到錨點時送長度上限內的整段對話，使用設定的整理模型（預設 Sonnet 5.5、effort low）。進度在同一個請求裡完成。
- 狀態卡：每次交接之後、以及每次有進度備忘的整理之後，各一個很小的低 effort 請求。送的是上一版卡片、四行摘要，以及交接摘要或進度備忘，不送整段對話。
- 防呆提醒不發任何請求。

**哪些資料會送出去。** 模型請求和對話本身一樣，透過 Claude Code 設定的供應商送出，mod 沒有獨立的網路用戶端。整理筆記時會送出你的訊息、Claude 的回覆與工具呼叫（每個輸入取前 300 字、每個結果取前 500 字）。對話片段保留最新 300,000 字，另加截短提示；請求還包含既有筆記、進度與指示。這些限制不是整個請求的大小上限。

**存在本機的資料：**

| 什麼 | 在哪 |
|---|---|
| 專案筆記 | `~/.claude/projects/<專案路徑>/memory/ctx-handoff.md` |
| 從面板刪除前的備份 | 筆記檔旁邊的 `.ctx-handoff-backup/` |
| 狀態卡 | 專案根目錄的 `_HANDOFF.md`，只動標記之間 |
| 每個 session 第一次寫卡片之前的 `_HANDOFF.md` 備份，以及有史以來第一份 | 專案根目錄的 `.ctx-handoff-backup/_HANDOFF.md.bak` 與 `_HANDOFF.md.first.bak` |
| 面板上的設定、最近的交接摘要、進度、狀態卡的副本、錯誤紀錄 | `~/.claude/plugins/store/ctx-handoff_*.json` |

**它能做什麼。** mod 沒有沙箱，會用你的權限執行。不用執行就能檢查它用了什麼：`claude plugin validate <ctx-handoff 資料夾>` 會印出 `hooks:`（它接收的事件）與 `calls:`（程式呼叫的功能）兩行，意思如下：

| 輸出裡的項目 | 用途 |
|---|---|
| `tool.call` | 套用你核准的守門；不可逆指令前先問；注意重複失敗、改檔後有沒有跑測試；附上回覆語言提醒 |
| `turn.step` | 讀主對話裡 Claude 回覆的可見文字，判斷語言；不改請求、模型或回覆 |
| `prompt.submit`、`prompt.context` | 交接時攔下你的訊息；把筆記與進度帶入新對話；重讀設定 |
| `$.session.messages`、`$.model.complete`、`$.model.fork` | 讀對話來整理筆記、寫交接摘要 |
| `$.fs.read`、`$.fs.write`、`$.fs.exists`、`$.fs.stat` | 讀寫筆記檔、`_HANDOFF.md`（只動標記之間）與它們的備份；寫入前與讀對話檔尾端前量檔案大小與修改時間；確認專案是不是 git repo |
| `$.process.run` | 用 `tail` 或 PowerShell 讀超過 4 MiB 的對話檔尾端，不執行其他東西 |
| `$.ui.ask`、`$.session.surfaces` | 不可逆指令前問「允許」或「拒絕」；確認有沒有畫面可以顯示詢問 |
| `session.compact` | 注意到壓縮：提示、重新計時、略過過時的 context 讀數 |
| `$.prompt.submit`、`$.command.run` | 把摘要送進新對話；執行 `/clear` |
| `$.env.get` | 讀三個環境變數 `CLAUDE_CONFIG_DIR`、`HOME`、`USERPROFILE`，只用來找到你的 `~/.claude` 資料夾，不需要另外設定 |
| `$.settings.read`、`config.set` | 讀 Claude Code 的 `language` 設定與這個 plugin 的 `pluginConfigs`；你改 Claude Code 的設定時跟著更新 |
| 其餘：`session.start`、`turn.complete`、`classic.Stop`、`command.run`、`$.command.register`、`ui.render`、`$.store`、`$.state`、`$.clock`、`$.ui`、`$.agent.list`、`$.session.*` | 日常運作：計時、`/handoff` 指令、狀態列、面板與提示、自己的儲存空間、交接前確認 Claude 和子代理都做完了，以及「說完成卻沒驗證」的提醒 |

它不自己連網（沒有 `$.http` 呼叫）。它能啟動的程式只有 `tail` 和 PowerShell，用來讀很大的對話檔尾端。想在不載入任何 mod 的狀態下工作，用 `claude --safe-mode` 啟動。另見 [`SECURITY.md`](../SECURITY.md)。

## 支援的環境

Claude Code 在大多數地方都會載入 mod，但只有終端機與 Desktop app 會畫出 mod 的畫面（[Claude Code 文件](https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run)）。

| 環境 | 背景功能 | 狀態列與面板 | 確認方式 |
|---|---|---|---|
| 終端機裡的 `claude`（含編輯器內建終端機、JetBrains） | 可以 | 可以 | 實測 |
| `claude -p` | 可以；`/handoff` 以文字回覆 | 不行 | 實測 |
| Desktop app 的 Code 分頁 | 可以 | 可以 | 依官方文件 |
| VS Code 擴充功能的聊天面板 | 可以（設定寫在 `settings.json`） | 不行 | 依官方文件 |
| Desktop app 的 WSL session | 不行（plugin 不會載入） | 不行 | 依官方文件 |

## 限制

- **偵測得到 5 分鐘快取，但不保證。** 用 API key、Bedrock、Vertex，或訂閱用量用完改扣額度的人，快取只有 5 分鐘。ctx-handoff 從對話檔尾端讀出 session 寫的是哪一種，略過幫不上忙的保持快取請求。看不出來時（剛開的 session、讀不到的檔案）照原本的方式保持快取，所以你知道自己的快取很短的話，執行 `/handoff refresh off`。
- **狀態卡是重寫，不是合併。** 你自己的筆記請寫在標記外面。標記裡的修改會當成下一次更新的起點，但之後的更新可能重寫它。
- **筆記跟著你啟動時所在的資料夾。** 在家目錄開 session 去改別的專案，筆記會記在家目錄底下。筆記不跨專案共用。
- **進度只跟最近一次整理一樣新。** 短對話或當機後可能沒有、或落後幾則；想要準確，`/clear` 前先打 `/handoff distill`。同一個資料夾同時開兩段對話時，會看到彼此的進度。
- **其他 session 要在下一則訊息才套用改過的設定**，不是立刻。
- **交接進行中更新 mod，可能遺失被攔下的訊息。** 快取計時會從 session 狀態還原，但超過到期時間 5 分鐘就不補。

## 疑難排解

先打 `/handoff`：它會顯示 context 用量、哪些功能開著，以及背景最近一次的錯誤。

| 狀況 | 檢查什麼 |
|---|---|
| 沒有 `/handoff` 指令 | mod 沒載入：看 `claude plugin list` 與 Claude Code 版本；用 clone 的話路徑要是絕對路徑。你有自己的 `/handoff` 時改用 `/ctx-handoff`。 |
| 行為怪怪的，懷疑是 mod | 用 `claude --safe-mode` 啟動，看問題是否消失。 |
| 新對話沒收到摘要 | `/handoff resend`。 |
| 筆記一直沒更新 | 定期與閒置整理會略過不到 30k token 的對話。`/handoff distill` 不受這個門檻限制，但上次整理後沒有新回合仍不會送請求。打 `/handoff` 看錯誤。 |
| 指令沒有回應 | 打 `/handoff` 看最近的錯誤，附上輸出[開 issue](https://github.com/cablate/ctx-handoff-mod/issues/new/choose)。 |

## 移除

1. 從 marketplace 安裝的：`claude plugin uninstall ctx-handoff@ctx-handoff-mod`。用 clone 的：從 `CLAUDE_CODE_PLUGIN_DIRS` 拿掉它的路徑（或不再加 `--plugin-dir`），再刪掉資料夾。
2. 選擇性：刪掉[存在本機的資料](#花費隱私與權限)列出的檔案；移除 plugin 不會刪它們。筆記是一般的 Markdown，你可能會想留著。

只想暫時關掉的話，在 `/plugin` 停用即可。

## 從原始碼執行

改用 clone 載入，存檔後立刻生效。

```sh
git clone https://github.com/cablate/ctx-handoff-mod ~/.claude/mods/ctx-handoff
claude --plugin-dir ~/.claude/mods/ctx-handoff
```

要每個 session 都載入，把它的絕對路徑加進 `~/.claude/settings.json` 的 `env`（多個路徑在 Windows 用 `;` 分隔，其他系統用 `:`）：

```json
"env": { "CLAUDE_CODE_PLUGIN_DIRS": "/home/you/.claude/mods/ctx-handoff" }
```
