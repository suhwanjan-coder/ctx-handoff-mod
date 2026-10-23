// Windows 路徑邊界：slug、根目錄、點路徑與 worktree。
import { expect } from 'claude-code/testing'
import { encodeProject, isAbs, resolveDots, slash } from './paths'
import { test, CLAUDE_PROJECTS, ctl, distillNow, world } from './test-world'

for (const [path, slug] of [
  ['C:\\Users\\u\\dev\\claude-mods', 'C--Users-u-dev-claude-mods'],
  ['G:\\我的雲端硬碟\\Claude\\圓桌', 'G---------Claude---'],
  ['C:\\proj\\', 'C--proj'], ['c:\\proj', 'c--proj'],
  ['/c/Users/u/proj', '-c-Users-u-proj'],
  ['\\\\server\\share\\x', '--server-share-x'],
  ['\\\\?\\C:\\x', '----C--x'],
  ['C:\\', 'C--'], ['/', '-'],
]) test(`路徑編碼：${path}`, () => expect(encodeProject(path!)).toBe(slug))

for (const [path, expected] of [
  ['C:/../x', 'C:/x'], ['C:/a/../../../x', 'C:/x'],
  ['C:/a//b/../../x', 'C:/x'], ['C:/./a/../', 'C:/'],
  ['/a/../../x', '/x'], ['./a/../x', 'x'],
  ['//server/share/a/../../../x', '//server/share/x'],
]) test(`點路徑不跨越根目錄：${path}`, () => expect(resolveDots(path!)).toBe(expected))

test('絕對路徑判斷使用統一斜線後的路徑', () => {
  for (const p of ['C:\\x', 'c:/x', '/c/x', '\\\\server\\share\\x', '\\\\?\\C:\\x', 'C:\\', '/']) expect(isAbs(slash(p))).toBe(true)
  for (const p of ['C:x', './x', '../x', 'x']) expect(isAbs(slash(p))).toBe(false)
})

test('磁碟根目錄啟動仍讀寫 Claude 的根目錄 slug', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  ctl.curRoot = 'C:\\'
  await distillNow($)
  expect(w.files.get(`${CLAUDE_PROJECTS}/C--/memory/ctx-handoff.md`)).toContain('使用者決定')
})

test('worktree 的絕對 gitdir 含點路徑與重複斜線仍對到主工作樹', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  w.files.set('C:/proj/.git', 'gitdir: D:/repos//temp/../main/.git/worktrees/feat\r\n')
  await distillNow($)
  expect(w.files.get(`${CLAUDE_PROJECTS}/D--repos-main/memory/ctx-handoff.md`)).toContain('使用者決定')
})

test('主工作樹在磁碟根目錄時仍辨識 gitdir', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  w.files.set('C:/proj/.git', 'gitdir: D:/.git/worktrees/feat\r\n')
  await distillNow($)
  expect(w.files.get(`${CLAUDE_PROJECTS}/D--/memory/ctx-handoff.md`)).toContain('使用者決定')
})

for (const home of ['C:/Users/u', 'D:/使用者/乙']) test(`機器的家目錄不會寫入經驗內容：${home}`, async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  ctl.envVars = { USERPROFILE: home }
  ctl.curRoot = 'G:/我的雲端硬碟/Claude/圓桌'
  await distillNow($)
  const file = `${home}/.claude/projects/G---------Claude---/memory/ctx-handoff.md`
  const content = w.files.get(file) ?? ''
  expect(content).toContain('  - 根據：1970-01-01 S1｜討論門檻後決定')
  expect(content).not.toContain(home)
  expect(content).not.toContain(ctl.curRoot)
})

// 預期值取自 Claude Code 2.1.299 執行檔內的真實函式。
test("長路徑編碼：原生路徑恰好 200 字元", () => {
  expect(encodeProject("C:\\aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe("C--aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
})

test("長路徑編碼：原生路徑 201 字元", () => {
  expect(encodeProject("C:\\aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe("C--aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-8x5zet")
})

test("長路徑編碼：原生路徑 300 字元", () => {
  expect(encodeProject("C:\\aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe("C--aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-lfvxy4")
})

test("長路徑編碼：正斜線 201 字元", () => {
  expect(encodeProject("C:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe("C--aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-9sl5w8")
})

test("長路徑編碼：正斜線 300 字元", () => {
  expect(encodeProject("C:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe("C--aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-xnqb4n")
})

test("長路徑編碼：中文長路徑", () => {
  expect(encodeProject("G:\\我的雲端硬碟\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\專案研究\\成果")).toBe("G--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------1nyl50")
})

test("長路徑編碼：空格長路徑", () => {
  expect(encodeProject("D:\\team space\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\long folder\\project")).toBe("D--team-space-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-f-qqmxkm")
})

test("長路徑編碼：POSIX 長路徑", () => {
  expect(encodeProject("/home/user/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/project/end")).toBe("-home-user-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-proje-3bjhre")
})

test("長路徑編碼：UNC 長路徑", () => {
  expect(encodeProject("\\\\server\\share\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\end")).toBe("--server-share-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-p-awa3ht")
})

test("長路徑編碼：延伸長路徑", () => {
  expect(encodeProject("\\\\?\\C:\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\project\\end")).toBe("----C--project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-project-p-3zots1")
})

test("長路徑編碼：emoji 長路徑", () => {
  expect(encodeProject("C:\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\研究😀\\end")).toBe("C--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------shz9sm")
})

test("長路徑整理寫到 Claude 的專案目錄：原生路徑 201 字元", async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  ctl.curRoot = "C:\\aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  await distillNow($)
  expect(w.files.get(`${CLAUDE_PROJECTS}/C--aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-8x5zet/memory/ctx-handoff.md`)).toContain('使用者決定')
})

test("長路徑整理寫到 Claude 的專案目錄：正斜線 201 字元", async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  ctl.curRoot = "C:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  await distillNow($)
  expect(w.files.get(`${CLAUDE_PROJECTS}/C--aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-9sl5w8/memory/ctx-handoff.md`)).toContain('使用者決定')
})

test('長路徑主工作樹保留 Windows 原生格式雜湊', async ($, on) => {
  const w = world(on, 100_000, 1_000_000, {}, [], 5)
  w.files.set('C:/proj/.git', "gitdir: D:/team space/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/long folder/project/.git/worktrees/feat\r\n")
  await distillNow($)
  expect(w.files.get(`${CLAUDE_PROJECTS}/D--team-space-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-folder-long-f-qqmxkm/memory/ctx-handoff.md`)).toContain('使用者決定')
})

test('原始路徑 201 字元含尾斜線仍使用長路徑雜湊', () => {
  expect(encodeProject("C:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/")).toBe("C--aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-9sl5uu")
})
