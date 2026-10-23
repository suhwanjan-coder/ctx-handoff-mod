// 截短點不能拆開 UTF-16 代理對，送進模型或 UTF-8 檔案時才不會變成替代字元。
import { expect, test } from 'claude-code/testing'
import { anchorOf, clip, transcriptOf } from './transcript'

const intact = (s: string) => expect(new TextDecoder().decode(new TextEncoder().encode(s)) === s).toBe(true)

test('工具截短保留完整的 emoji', () => {
  const out = clip(`${'中'.repeat(299)}😀尾`, 300)
  intact(out)
  expect(out).not.toContain('尾')
})

test('使用者錨點不切開代理對', () => intact(anchorOf(`${'中'.repeat(29)}😀尾`)))

test('工具輸入與 CRLF 結果在截短邊界仍是完整 Unicode', () => {
  const out = transcriptOf([{ role: 'assistant', text: '', toolUses: [
    { tool: 'Read', input: { x: `${'中'.repeat(293)}😀尾` }, text: `甲\r\n${'中'.repeat(497)}😀尾` },
  ] }], undefined).text
  intact(out)
  expect(out).not.toContain('\r')
})

test('保留最後三十萬字時不從低代理開始', () => {
  const out = transcriptOf([{ role: 'user', text: `😀${'中'.repeat(299_999)}`, toolUses: [] }], undefined).text
  intact(out)
  expect(out).toContain('前面省略')
})
