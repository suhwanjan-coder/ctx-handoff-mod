# 更新紀錄

[English](CHANGELOG.md)

ctx-handoff 每個版本值得注意的改動。格式依照 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，版號依照 [Semantic Versioning](https://semver.org/)；1.0 之前，任何次版號都可能改變行為。版號以 `.claude-plugin/plugin.json` 為準；從 marketplace 安裝的使用者，只有版號變了才收得到更新。

## [未發布]

### 新增

- 離開回來時的短指令：`/hc` 等於 `/handoff continue`，`/hr` 等於 `/handoff resume`；也可以打 `/handoff c`、`/handoff r`。`/hc` 或 `/hr` 已被別的指令使用時，就略過那個短指令，長寫法照常可用。

### 變更

- **操作限制更清楚：** 指南區分手動整理與自動門檻，說明守門比對、狀態輸出、設定範圍與卡片寫入限制，並修正交接與請求花費的描述。

### 修正

- 不可逆指令確認現在能抓到巢狀引號裡的路徑、`find -delete` 和緊貼指令分隔符號的旗標。預演旗標只豁免自己的命令；引號裡名為 `-WhatIf` 的路徑、子運算式外面的旗標不再遮掉破壞性指令。`cargo rm`、`git -C repo rm` 和單純的 PowerShell 刪除或磁碟格式化預演不再多問。相鄰引號組成的長字串不再反覆掃描同一段前綴。
- **Windows 路徑與 Unicode：** 從磁碟根目錄啟動，或 worktree 路徑含點路徑、重複分隔符時，經驗檔會寫到正確資料夾；截短對話文字時不再切斷 emoji。
- 專案路徑超過 200 字元時，改用與 Claude Code 相同的截短資料夾名稱及原始路徑雜湊，讓經驗檔與對話檔對到正確的專案資料夾。

## [0.6.0] - 2026-10-09

交接之後多了一張一眼看得懂的狀態卡，mod 不再動你的 repo，Bash 與 PowerShell 要執行回不去的指令前會先問你。

**升級注意：** 專案筆記預設不再帶進對話；要回到舊的行為，在面板的設定分頁打開 `inject_notes`。`mark_in_project` 工具和把規則放進你 repo 的那一步都拿掉了。其他不用做什麼。

### 新增

- **`_HANDOFF.md` 裡的狀態卡：** 每次交接之後，以及背景整理有進度時，重寫 `<!-- ctx-handoff:card rev=N -->` 與 `<!-- /ctx-handoff:card -->` 之間的一塊：狀態、執行中的東西、等你回答的事、下一步、最後一次驗證、試過不行的做法與已定案的決定。標記以外一個字都不動，換行與 BOM 保持原樣，每個 session 第一次寫之前先備份，寫入前檔案被改過就不覆蓋。沒有 `_HANDOFF.md` 時，`/handoff card init` 會建立一個。設定：`card`、`card_model`。
- **`/handoff` 裡的 session 摘要：** 目前工作、最後活動時間、最近 3 個工具呼叫與最後一句回覆，從對話檔尾端讀出，檔案沒變就用快取。
- **真正的快取 TTL：** 從對話檔讀出這個 session 的快取 TTL（1 小時或 5 分鐘），顯示在 `/handoff`。只寫 5 分鐘快取的 session 會略過幫不上忙的保持快取請求，改存離席摘要。
- **壓縮提示：** 「已壓縮 214k → 31k」，閒置計時重新開始，自動交接也不會拿還是壓縮前的 context 讀數判斷。
- **不可逆指令的確認：** `rm -rf`、`git push --force`、`git reset --hard`、`DROP TABLE`、`npm publish` 這類指令，包在 `bash -c`、`sudo`、`xargs`、`powershell -Command`、`cmd /c` 裡面的也一樣，先問「允許」或「拒絕」。像 `claude -p` 這種沒有畫面可以問的環境，指令照常執行並留一行紀錄。設定：`command_guard`。
- **新的首頁：** README 以 banner 和動畫概覽開場，每個功能配一張圖，細節移到[使用指南](docs/guide.zh-TW.md)。
- **繁體中文更新紀錄：** `CHANGELOG.zh-TW.md`，GitHub Release 也同時附上兩種語言。

### 變更

- **筆記預設不帶進對話：** 筆記檔照樣在背景維護、可以編輯，但只有 `inject_notes` 打開時，內容才會帶進新對話和你的下一則訊息。
- **「告訴新對話停在哪」先讀狀態卡：** 新對話會被告知卡片上的狀態與下一步（你手動改過的那一行也算），沒有卡片時用進度備忘。
- **所有設定都宣告在 `plugin.json`：** 之前 `userConfig` 只列了一部分。
- 給貢獻者：狀態卡、摘要與指令檢查都是純函式模組（`card.ts`、`digest.ts`、`cmdguard.ts`），各有測試；`tools/manifest.test.mjs` 讓 `plugin.json` 和設定保持一致；測試環境模擬 `fs.stat`、`process.run` 與詢問對話框。

### 移除

- **把規則放進你的 repo：** `mark_in_project` 工具、新對話開頭的交代，以及「已在 repo」的標記。ctx-handoff 不再寫 `CLAUDE.md`、`AGENTS.md` 或 skill 檔案。

### 修正

- 面板「提草稿」提示列裡有一個什麼都沒做的 `replace`。
- **狀態卡的安全性（審查發現）：** 欄位裡看起來像卡片標記的文字，會讓卡片提早結束，每次重寫都多留一堆殘渣；現在標記要整行、不在程式碼框裡才算，YAML front matter 不會被寫進去，不是 UTF-8 的檔案不動並提示，有史以來第一份備份另存成 `_HANDOFF.md.first.bak`，更新進行中你改了卡片的話這次更新作廢。
- **不可逆指令確認（審查發現）：** 沒人回答的詢問 120 秒後逾時並拒絕，排程或 `/loop` 觸發的回合不問、直接拒絕，多抓了幾種破壞性指令（`robocopy /MIR`、`git push --delete`、`git stash drop`、`git filter-branch`、把 `-Recurse` 的清單接到 `Remove-Item`、`[IO.Directory]::Delete`、`rd/s/q`、`shutil.rmtree`），`Remove-Item -WhatIf` 和沒有 SQL 用戶端執行的 SQL 文字不再詢問。
- **第二輪審查：** 縮排的程式碼區塊或 HTML 註解裡長得像標記的行，不會再讓卡片更新吞掉你的文字（卡片是第一個結尾標記加上它上面最近的開頭標記）；`Remove-Item -WhatIf:$false` 視為真的執行；經由 `python -c` 或 `node -e` 執行的 SQL 也抓得到；`"R&D"` 這種路徑不再把指令切斷；`robocopy /L` 和 `rmdir /s/foo` 不再詢問。
- **session 摘要（審查發現）：** `[Request interrupted by user]` 這類行不再被當成目前工作。

## [0.5.0] - 2026-10-08

Claude 現在會注意到自己的小錯：重跑同一個失敗時提醒、沒測試就說完成時請它驗證、講到一半漂成別的語言時提醒。新對話知道上一段停在哪，你重複做的工作會變成專案 skill，所有設定集中到面板的一個分頁。

**升級：** 0.4 設過的值會保留，改在面板的「設定」分頁顯示（`/handoff panel` 後按 5），不在 `/config`。

### 新增

- **告訴新對話停在哪：** 你自己 `/clear`、當掉或直接開新對話後，同一個資料夾的下一段對話會被提醒一次上一段在做什麼、下一步是什麼（24 小時內）。它跟著整理筆記一起產生，不多花請求。設定：`resume_hint`。
- **重複失敗提醒：** 同一個工具連續兩次因同樣原因失敗時，請 Claude 找出原因，不要原樣重試。設定：`retry_nudge`。
- **說完成前先驗證：** Claude 改了程式、之後沒跑測試、建置或檢查就說完成時，請它驗證一次並附上結果。設定：`done_check`。
- **回覆語言提醒：** Claude 的說明漂離你的語言（繁體中文、簡體中文、英文、日文）時，在這一輪過程中提醒一次。程式碼、路徑與中文裡夾的英文術語不算。設定：`reply_language`。
- **流程變成專案 skill：** 你讓 Claude 重複做過的多步驟工作（例如發版）會記成流程；出現 3 次後，Claude 會在你的 repo 建立 `.claude/skills/<名稱>/SKILL.md`，不 commit。
- **面板的設定分頁：** 所有設定集中在一處，標出每個值從哪來，並可以還原。
- **整理間隔可以調：** `distill_every`（預設 30 則訊息）。

### 變更

- **交接摘要更好用：** 分開驗證過的與還沒驗證的改動，列出失敗過的做法與沒收尾的事，保留你訂的限制，最後給一個下一步。
- **設定離開 `/config`：** 改放在面板，`/config` 不會越來越長。`settings.json` 裡的值仍然有效，給看不到面板的 VS Code 擴充功能用；兩邊都有時以面板為準。
- README 為第一次接觸的讀者重寫。
- 給貢獻者：檢查加入 Biome lint，程式拆成較小的檔案，測試依主題分檔。

### 修正

- 「說完成前先驗證」不再把背景子代理改的檔算成主對話的。

## [0.4.0] - 2026-10-07

一再出現的規則現在會放進你的 repo，換機器、換工具都看得到；調整設定也不必再改程式。

### 新增

- **規則放進 repo：** 出現 3 次的規則或已啟用的守門，會在下一段 git repo 對話開頭交給 Claude。Claude 會放進專案放規則的地方、檢查重複、不 commit，並說明放在哪；之後 ctx-handoff 不再帶入自己那份。你說不要就會復原。

### 變更

- **設定不再寫在程式裡：** 門檻、閒置時間、保持快取次數、最小對話、整理模型與語言都是 plugin 設定，更新後保留。
- 保持快取已在實際 session 確認有效：第 2、3 次刷新（閒置 110、165 分鐘）整段都從快取讀取。
- 給貢獻者：程式拆成較小的檔案，`CONTRIBUTING.md` 寫了程式風格，並加上 `.editorconfig`。

### 修正

- Claude 回報「規則已放進 repo」用的工具，在 session 接續或 mod 重新載入後仍然可用。

## [0.3.0] - 2026-10-07

可以從 plugin marketplace 安裝、有英文介面，並能在面板核准守門。

### 新增

- **從 plugin marketplace 安裝：** `claude plugin marketplace add cablate/ctx-handoff-mod`，再 `claude plugin install ctx-handoff@ctx-handoff-mod`。
- **英文介面：** 介面語言跟著系統語系或 Claude Code 的 `language` 設定：中文用繁體中文，其他用英文。
- **守門：** `/handoff guard suggest` 把出現 3 次的規則變成工具呼叫的檢查（擋下或提醒）。你核准前不會生效。
- **面板：** `/handoff panel` 在輸入框上方開面板，可以核准守門、看最近一次整理、刪掉記錯的筆記（會先備份）。
- 狀態列倒數到下一次整理筆記，整理時也會顯示。

### 變更

- 交接摘要與專案筆記用你在對話裡使用的語言撰寫。
- 每條記憶改成一行標題加細節。偏好與修正整條帶入；事實與位置只帶標題。
- 事實與位置超過 30 天沒被證實就封存（不帶入、不刪除），不再限制筆記條數。

### 修正

- 訊息不再重複 Claude Code 已經加上的 `[ctx-handoff]` 前綴。
- mod 重新載入後，閒置快取計時會接續。
- 面板不再每次重畫都讀檔，按鈕不會像卡住。

## 0.2.0 - 2026-10-05

筆記留在你開始工作的專案裡，整理的花費也大幅降低。

**從 0.1 升級：** 舊版放錯位置的筆記不會自動搬移。請手動搬，或用 `node tools/notes.mjs`（見 [`tools/README.md`](tools/README.md)）。

### 新增

- `/handoff` 被你自己的指令或 skill 佔用時，改成 `/ctx-handoff`。
- 交接與整理請求有時間上限。

### 變更

- 每個專案資料夾一份筆記（以 session 啟動的資料夾為準）。不再寫進 session 碰過的其他 repo。
- 筆記改由 Sonnet 5.5（effort low）只讀新增的對話來整理，不再複製整段對話。

## 0.1.0 - 2026-10-03

第一版：context 到門檻時自動交接、離開時保持快取並在之後存好交接摘要，以及專案筆記。

[未發布]: https://github.com/cablate/ctx-handoff-mod/compare/ctx-handoff--v0.6.0...HEAD
[0.6.0]: https://github.com/cablate/ctx-handoff-mod/compare/ctx-handoff--v0.5.0...ctx-handoff--v0.6.0
[0.5.0]: https://github.com/cablate/ctx-handoff-mod/compare/ctx-handoff--v0.4.0...ctx-handoff--v0.5.0
[0.4.0]: https://github.com/cablate/ctx-handoff-mod/compare/ctx-handoff--v0.3.0...ctx-handoff--v0.4.0
[0.3.0]: https://github.com/cablate/ctx-handoff-mod/releases/tag/ctx-handoff--v0.3.0
