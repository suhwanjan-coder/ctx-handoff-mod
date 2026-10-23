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
