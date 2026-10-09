// 不可逆指令確認：Bash／PowerShell 的 rm -r、git push --force 這類指令先問使用者。
// 取捨：引號裡的字串也會掃（echo "rm -rf /" 會被問一次）；包裝（bash -c、sudo、xargs、powershell -Command、cmd /c）本身不觸發，裡面的指令照掃
import { expect, test } from 'claude-code/testing'
import { irreversible } from './cmdguard'
import { cmd, ctl, pushGuard, startSession, world } from './test-world'

const hit = (command: string, tool = 'Bash') => irreversible(tool, command)?.id

// ---------- 偵測（純函式） ----------

const POSITIVE: [string, string][] = [
  ['rm -rf node_modules', 'rm-r'],
  ['rm -r dir', 'rm-r'],
  ['rm -fr build', 'rm-r'],
  ['rm -Rf build', 'rm-r'],
  ['rm --recursive dir', 'rm-r'],
  ['/bin/rm -rf /tmp/x', 'rm-r'],
  ['ls && rm -rf out', 'rm-r'],
  ['Remove-Item .\\dist -Recurse', 'remove-item-recurse'],
  ['Remove-Item -Path x -Recurse -Force', 'remove-item-recurse'],
  ['Remove-Item x -Recurse:$true', 'remove-item-recurse'],
  ['rm -Recurse -Force x', 'remove-item-recurse'],
  ['rmdir /s /q build', 'del-s'],
  ['del /s /q *.tmp', 'del-s'],
  ['git push --force', 'push-force'],
  ['git push -f origin main', 'push-force'],
  ['git push origin main --force-with-lease', 'push-force'],
  ['git push --force-if-includes', 'push-force'],
  ['git push -fu origin main', 'push-force'],
  ['git push origin +main', 'push-force'],
  ['git -C repo push -f', 'push-force'],
  ['git reset --hard', 'reset-hard'],
  ['git reset --hard HEAD~3', 'reset-hard'],
  ['git clean -fd', 'clean-force'],
  ['git clean -fdx', 'clean-force'],
  ['git clean -df', 'clean-force'],
  ['git clean --force', 'clean-force'],
  ['git branch -D old-branch', 'branch-D'],
  ['git branch --delete --force old', 'branch-D'],
  ['git checkout -- .', 'checkout-all'],
  ['git checkout .', 'checkout-all'],
  ['git checkout HEAD -- .', 'checkout-all'],
  ['git restore .', 'restore-all'],
  ['git restore --worktree .', 'restore-all'],
  ['git restore --staged --worktree .', 'restore-all'],
  ['psql -c "DROP TABLE users"', 'drop-sql'],
  ['mysql -e "drop database prod"', 'drop-sql'],
  ['sqlite3 a.db "DROP TABLE IF EXISTS t;"', 'drop-sql'],
  ['psql -c "TRUNCATE TABLE logs"', 'truncate-sql'],
  ['npm publish', 'publish'],
  ['npm publish --access public', 'publish'],
  ['pnpm publish --no-git-checks', 'publish'],
  ['pnpm -r publish', 'publish'],
  ['format D:', 'format'],
  ['format c: /q', 'format'],
]
// 包裝：裡面的指令照掃
const WRAPPED: [string, string][] = [
  ['bash -c "rm -rf build"', 'rm-r'],
  ["sh -c 'cd out && rm -rf cache'", 'rm-r'],
  ['sudo rm -rf /var/tmp/x', 'rm-r'],
  ['sudo -u deploy git push --force', 'push-force'],
  ["find . -name '*.o' | xargs rm -rf", 'rm-r'],
  ['git branch --merged | xargs git branch -D', 'branch-D'],
  ['powershell -Command "Remove-Item -Recurse -Force C:\\tmp\\x"', 'remove-item-recurse'],
  ['pwsh -NoProfile -Command "Remove-Item -Recurse x"', 'remove-item-recurse'],
  ['cmd /c rmdir /s /q build', 'del-s'],
  ['cmd /c "del /s /q *.tmp"', 'del-s'],
  ['bash -c "bash -c \\"git reset --hard\\""', 'reset-hard'],
  ['env FOO=1 nohup sh -c "git clean -fd" &', 'clean-force'],
]

const NEGATIVE = [
  'rm file.txt',
  'rm -f file.txt',
  'rm -v a.txt b.txt',
  'git push',
  'git push origin main',
  'git push -u origin feature',
  'git push --follow-tags',
  'git push --tags',
  'grep -rf patterns.txt src',
  'ls -r',
  'ls -lR',
  'git clean -n',
  'git clean -nfd',
  'git clean --dry-run -fd',
  'git restore --staged .',
  'git restore file.txt',
  'git checkout main',
  'git checkout -b feature',
  'git checkout -- file.txt',
  'git branch -d merged',
  'git branch -a',
  'git reset --soft HEAD~1',
  'git reset HEAD file.txt',
  'git rm --cached file',
  'git rm -r --cached dir',
  'git commit -m "fix typo"',
  'git format-patch -1',
  'npm publish --dry-run',
  'npm install publish-pkg',
  'npm run build',
  'docker run --rm -it ubuntu',
  'Remove-Item file.txt -Force',
  'Get-ChildItem -Recurse',
  'rmdir emptydir',
  'del file.tmp',
  'truncate -s 0 app.log',
  'sudo apt update',
  'bash -c "echo hi"',
  'cmd /c dir',
  'powershell -Command "Get-Date"',
  'xargs echo',
  'cat README.md',
]

test('不可逆指令：該攔的都認得（含包裝裡面的）', () => {
  for (const [command, id] of [...POSITIVE, ...WRAPPED]) expect([command, hit(command)]).toEqual([command, id])
  // PowerShell 工具也一樣
  expect(hit('Remove-Item -Recurse x', 'PowerShell')).toBe('remove-item-recurse')
})

test('不可逆指令：看起來像但無害的不攔', () => {
  for (const command of NEGATIVE) expect([command, hit(command)]).toEqual([command, undefined])
})

test('不可逆指令：只管 Bash 與 PowerShell；沒有指令文字不處理；-EncodedCommand 解碼後再掃', () => {
  expect(irreversible('Read', 'rm -rf x')).toBeUndefined()
  expect(irreversible('Edit', 'rm -rf x')).toBeUndefined()
  expect(irreversible('Bash', undefined)).toBeUndefined()
  expect(irreversible('Bash', '')).toBeUndefined()
  const encode = (s: string) => btoa(Array.from(s, c => String.fromCharCode(c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8)).join(''))
  expect(hit(`powershell -NoProfile -EncodedCommand ${encode('Remove-Item -Recurse C:\\x')}`, 'PowerShell')).toBe('remove-item-recurse')
  expect(hit(`powershell -EncodedCommand ${encode('Get-Date -Format yyyy')}`, 'PowerShell')).toBeUndefined()
})

test('不可逆指令：引號裡的字串也會掃（取捨：echo "rm -rf /" 會被問一次）', () => {
  expect(hit('echo "rm -rf /"')).toBe('rm-r')
  expect(hit("git commit -m 'git push --force is bad'")).toBe('push-force')
})

// ---------- 經由 plugin ----------

const ids = (w: ReturnType<typeof world>) => w.asks.map(a => a.options.join('/'))

test('有畫面：問「允許／拒絕」；拒絕就擋下並告訴 AI，允許就放行', async ($, on) => {
  const w = world(on, 1000)
  await startSession($)
  ctl.askAnswer = '拒絕'
  const denied = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  expect(denied.deny).toContain('使用者拒絕了不可逆指令（rm -r）')
  expect(w.asks).toHaveLength(1)
  expect(w.asks[0]).toMatchObject({ header: '不可逆指令', options: ['允許', '拒絕'] })
  expect(w.asks[0]?.question).toContain('這個 Bash 指令含不可逆操作（rm -r），要執行嗎？')
  expect(w.asks[0]?.question).toContain('rm -rf build')
  expect(w.toasts.some(x => x.includes('已拒絕 Bash 的不可逆指令：rm -r'))).toBe(true)
  ctl.askAnswer = '允許'
  const ok = await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })
  expect(ok.deny).toBeUndefined()
  expect(ok.isError).toBeFalsy()
  expect(w.logs.some(l => l.includes('使用者允許 Bash 的不可逆指令（git push --force）'))).toBe(true)
})

test('關掉對話框、或輸入「允許」「拒絕」以外的字：視同拒絕', async ($, on) => {
  const w = world(on, 1000)
  await startSession($)
  ctl.askAnswer = 'dismiss'
  expect((await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })).deny).toContain('使用者拒絕了不可逆指令（git reset --hard）')
  ctl.askAnswer = '我想想'
  expect((await $.tool.call({ tool: 'PowerShell', command: 'Remove-Item -Recurse x' })).deny).toContain('Remove-Item -Recurse')
  expect(w.asks).toHaveLength(2)
})

test('無害的指令不問；其他工具不問', async ($, on) => {
  const w = world(on, 1000)
  await startSession($)
  for (const command of ['rm file.txt', 'git push', 'grep -rf p src', 'npm publish --dry-run']) {
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  }
  await $.tool.call({ tool: 'Edit', command: 'rm -rf x' } as never)
  expect(w.asks).toEqual([])
})

test('沒有畫面（-p、SDK）：照常執行並記一行，不問、不擋', async ($, on) => {
  const w = world(on, 1000)
  // session.start 的 isInteractive 是 false
  await $.session.start({ cwd: 'C:/proj', surface: null, isInteractive: false })
  const r = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  expect(r.deny).toBeUndefined()
  expect(w.asks).toEqual([])
  expect(w.logs.some(l => l.includes('沒有畫面可以確認') && l.includes('rm -r'))).toBe(true)
  expect(w.toasts).toEqual([])
})

test('沒有任何畫面（surfaces 空）也照常執行；查不出有沒有畫面也放行', async ($, on) => {
  const w = world(on, 1000)
  await startSession($)
  ctl.surfaces = []
  expect((await $.tool.call({ tool: 'Bash', command: 'git clean -fd' })).deny).toBeUndefined()
  expect(w.asks).toEqual([])
  expect(w.logs.some(l => l.includes('沒有畫面可以確認'))).toBe(true)
})

test('command_guard 關閉：什麼都不問', async ($, on) => {
  const w = world(on, 1000)
  ctl.pluginOptions = { ...ctl.pluginOptions, command_guard: false }
  await startSession($)
  expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })).deny).toBeUndefined()
  expect(w.asks).toEqual([])
  expect((await cmd($, '')).text).toContain('不可逆指令確認：off')
})

test('使用者核准的守門先比：擋下的就不再問；提醒型的通過後仍會問', async ($, on) => {
  const w = world(on, 1000, 1_000_000, { 'guards:C--proj': [{ ...pushGuard('on', 'deny'), match: 'git\\s+push', unless: undefined }] })
  await startSession($)
  const blocked = await $.tool.call({ tool: 'Bash', command: 'git push --force' })
  expect(blocked.deny).toContain('守門 #1')
  expect(w.asks).toEqual([])
  w.put('guards:C--proj', [{ ...pushGuard('on', 'remind'), match: 'git\\s+push' }])
  ctl.askAnswer = '允許'
  const r = await $.tool.call({ tool: 'Bash', command: 'git push --force' })
  expect(r.deny).toBeUndefined()
  expect(w.asks).toHaveLength(1)
  expect(r.context?.some(c => c.includes('守門 #1'))).toBe(true)
  expect(ids(w)).toEqual(['允許/拒絕'])
})

test('英文介面：問題與選項是英文', async ($, on) => {
  const w = world(on, 1000, 1_000_000, {}, [], 0, 'English')
  await startSession($)
  ctl.askAnswer = 'Deny'
  const r = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  expect(w.asks[0]).toMatchObject({ header: 'Irreversible', options: ['Allow', 'Deny'] })
  expect(w.asks[0]?.question).toContain('This Bash command contains an irreversible operation (rm -r). Run it?')
  expect(r.deny).toContain('The user denied an irreversible command (rm -r)')
})

test('不可逆指令：很長的指令（heredoc、幾十萬字）也在極短時間掃完，不會卡住', () => {
  const heredoc = `cat <<'EOF'\n${'git push origin main and some prose with git and push words\n'.repeat(3000)}EOF`
  let t0 = Date.now()
  expect(hit(heredoc)).toBeUndefined()
  const many = 'git status && git log --oneline | head -5 ; echo hello world rm file push -f foo '.repeat(4000)
  expect(hit(many)).toBeUndefined()
  expect(Date.now() - t0).toBeLessThan(2000)
  // 長指令尾巴真的有不可逆操作還是抓得到
  t0 = Date.now()
  expect(hit(`${many}\ngit push --force origin main`)).toBe('push-force')
  expect(Date.now() - t0).toBeLessThan(2000)
})

test('不可逆指令：換行是分隔符號，續行接起來；跨行的 SQL 看得到', () => {
  expect(hit('git push \\\n  --force origin main')).toBe('push-force')
  expect(hit('git push \\\r\n  --force origin main')).toBe('push-force')
  expect(hit('Remove-Item .\\dist `\n  -Recurse', 'PowerShell')).toBe('remove-item-recurse')
  // 下一行是另一個指令：不會把上一行的 git push 和下一行的 -f 接起來
  expect(hit('git push origin main\ngrep -f patterns.txt src')).toBeUndefined()
  expect(hit('echo a\nrm -rf build')).toBe('rm-r')
  expect(hit('psql <<SQL\nDROP\nTABLE users;\nSQL')).toBe('drop-sql')
})
