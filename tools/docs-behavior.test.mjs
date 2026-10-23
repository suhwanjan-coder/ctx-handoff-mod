// 文件契約回歸：雙語結構檢查以外，保留本次實測確認的操作限制。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const source = read('hooks/config.ts')

for (const suffix of ['', '.zh-TW']) {
  const guide = read(`docs/guide${suffix}.md`)
  const readme = read(`README${suffix}.md`)
  const zh = suffix !== ''
  test(`整理門檻說明區分手動與自動${suffix}`, () => {
    assert.ok(zh
      ? /手動整理與交接前整理不受.*min_tokens/.test(guide)
      : /Manual and pre-handoff updates bypass.*min_tokens/.test(guide))
    assert.ok(zh ? /沒有新回合.*不會再整理/.test(guide) : /No new turns.*no new update/.test(guide))
  })
  test(`守門範例不得宣稱能追蹤先前測試${suffix}`, () => {
    assert.ok(guide.includes('preflight'))
    assert.ok(zh ? /不追蹤先前.*測試/.test(guide) : /does not track earlier.*tests/.test(guide))
    assert.ok(!guide.includes('git push without running tests') && !guide.includes('沒跑測試就 git push'))
  })
  test(`設定表列出實際範圍與自由模型名稱${suffix}`, () => {
    for (const m of source.matchAll(/key: '(\w+)', kind: 'num', min: ([\d_.]+), max: ([\d_.]+)/g)) {
      const row = guide.split('\n').find(line => line.startsWith(`| \`${m[1]}\` |`)) ?? ''
      assert.ok(row.includes(`${Number(m[2].replaceAll('_', ''))}–${Number(m[3].replaceAll('_', ''))}`), m[1])
    }
    assert.ok(zh ? /兩個模型設定.*清單外/.test(guide) : /Both model settings.*outside the list/.test(guide))
  })
  test(`指令別名與三個固定狀態行有說明${suffix}`, () => {
    for (const command of ['/handoff status', '/handoff 狀態', '/handoff 接續', '/handoff 繼續']) assert.ok(guide.includes(command), command)
    assert.ok(zh ? /三行一律顯示/.test(guide) : /All three lines are always shown/.test(guide))
  })
  test(`介面語言與回覆語言的 auto 不混淆${suffix}`, () => {
    assert.ok(zh ? /介面.*「中文」.*繁體中文/.test(guide) : /interface.*"Chinese".*Traditional Chinese/.test(guide))
    assert.ok(zh ? /只有未設定.*系統語系/.test(guide) : /Only an unset.*system locale/.test(guide))
  })
  test(`首頁交接說明包含等待使用者與附帶請求${suffix}`, () => {
    assert.ok(zh ? /回報.*等待你的指示/.test(readme) : /reports.*waits for your instructions/.test(readme))
    assert.ok(zh ? /整理與狀態卡.*額外請求/.test(readme) : /notes and card updates.*additional requests/.test(readme))
    assert.ok(!readme.includes('sends nothing anywhere but Anthropic') && !readme.includes('除了 Anthropic 不送到任何地方'))
  })
  test(`摘要尾端與增量整理的退路有說明${suffix}`, () => {
    assert.ok(guide.includes('512 KB'))
    assert.ok(zh ? /找不到.*錨點.*整段/.test(guide) : /anchor.*not found.*whole conversation/.test(guide))
    assert.ok(zh ? /讀不到.*訊息列/.test(guide) : /cannot be read.*message rows/.test(guide))
  })
  test(`記憶引用驗證與帶入上限有說明${suffix}`, () => {
    assert.ok(zh ? /新增.*偏好.*原話/.test(guide) : /Adding.*preferences.*quote/.test(guide))
    assert.ok(zh ? /最多 15 條/.test(guide) : /at most 15/.test(guide))
    assert.ok(zh ? /超過 30 天/.test(guide) : /more than 30 days/.test(guide))
  })
  test(`卡片更新與寫檔保護不作絕對保證${suffix}`, () => {
    assert.ok(zh ? /內容沒變.*不重寫/.test(guide) : /unchanged.*not rewritten/.test(guide))
    assert.ok(zh ? /檢查與寫入.*空隙/.test(guide) : /gap between.*check and.*write/.test(guide))
  })
  test(`首頁與花費段也交代增量整理的退路${suffix}`, () => {
    assert.ok(zh ? /找不到錨點.*整段/.test(readme) : /anchor is missing.*whole conversation/.test(readme))
    const cost = guide.split(zh ? '**花費。**' : '**Cost.**')[1]
    assert.ok(zh ? /筆記：.*找不到錨點/.test(cost) : /Notes:.*anchor is missing/.test(cost))
  })
  test(`首頁卡片說明排除內容未變的重寫${suffix}`, () => {
    assert.ok(zh ? /內容沒變.*不重寫/.test(readme) : /unchanged.*not rewritten/.test(readme))
  })
  test(`首頁排程拒絕說明限定有互動畫面${suffix}`, () => {
    assert.ok(zh ? /有互動畫面時.*120 秒.*排程/.test(readme) : /With an interactive surface.*120 seconds.*scheduled/.test(readme))
  })
  test(`首頁摘要表與替代文字不再宣稱新對話自行開工${suffix}`, () => {
    assert.ok(!readme.includes('a fresh one continues') && !readme.includes('a fresh session continues from it') && !readme.includes('新對話接著做'))
  })
}

test('開發指引不把 30k 門檻、引用驗證與 hook 初始化寫成無例外通則', () => {
  const doc = read('CLAUDE.md')
  assert.ok(doc.includes('手動與交接前整理不受 min_tokens 限制'))
  assert.ok(doc.includes('已有「使用者原話」根據的舊條目'))
  assert.ok(!doc.includes('每個 hook 進來先 `await initLang($)`'))
})
