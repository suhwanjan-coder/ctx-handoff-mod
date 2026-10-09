// 獨立審查（0.6.0）第 8、9 項：不可逆指令偵測的漏報與誤報
import { expect, test } from 'claude-code/testing'
import { irreversible } from './cmdguard'

const hit = (command: string, tool = 'Bash') => irreversible(tool, command)?.id

const MISSED_BEFORE: [string, string, string?][] = [
  ['robocopy C:\\src D:\\dst /MIR', 'robocopy-mir'],
  ['robocopy src dst /E /PURGE', 'robocopy-mir'],
  ['robocopy src dst /mir /r:0', 'robocopy-mir', 'PowerShell'],
  ['Get-ChildItem x -Recurse | Remove-Item -Force', 'remove-item-recurse', 'PowerShell'],
  ['gci x -Recurse -Filter *.tmp | ri', 'remove-item-recurse', 'PowerShell'],
  ['Get-ChildItem . -Recurse | Where-Object { $_.Length -eq 0 } | Remove-Item', 'remove-item-recurse', 'PowerShell'],
  ['Get-ChildItem . -Recurse | ForEach-Object { Remove-Item $_.FullName }', 'remove-item-recurse', 'PowerShell'],
  ['Get-ChildItem . -r | % { ri $_ }', 'remove-item-recurse', 'PowerShell'],
  ['git push --delete origin old-branch', 'push-delete'],
  ['git push -d origin old-branch', 'push-delete'],
  ['git push origin :old-branch', 'push-delete'],
  ['git -C repo push upstream :refs/heads/x', 'push-delete'],
  ['git stash drop', 'stash-drop'],
  ['git stash drop stash@{1}', 'stash-drop'],
  ['git stash clear', 'stash-drop'],
  ['git filter-branch --force --index-filter x HEAD', 'filter-branch'],
  ['git filter-repo --path a', 'filter-branch'],
  ['[IO.Directory]::Delete("C:\\x", $true)', 'dotnet-delete', 'PowerShell'],
  ['[System.IO.Directory]::Delete($p,$true)', 'dotnet-delete', 'PowerShell'],
  ['rd/s/q build', 'del-s'],
  ['rmdir/s build', 'del-s'],
  ['cmd /c rd/s/q build', 'del-s'],
  ['python -c "import shutil; shutil.rmtree(\'build\')"', 'rmtree'],
  ['python3 -c "import shutil;shutil.rmtree(p, ignore_errors=True)"', 'rmtree'],
]
test('review-8：漏報補上（robocopy /MIR、管線刪除、git push --delete、stash drop、filter-branch、.NET Delete、rd/s/q、shutil.rmtree）', () => {
  for (const [command, id, tool] of MISSED_BEFORE) expect([command, hit(command, tool ?? 'Bash')]).toEqual([command, id])
})

const FALSE_POSITIVES_BEFORE = [
  ['Remove-Item x -Recurse -WhatIf', 'PowerShell'],
  ['Remove-Item x -WhatIf -Recurse', 'PowerShell'],
  ['Remove-Item x -Recurse:$false', 'PowerShell'],
  ['Get-ChildItem x -Recurse | Remove-Item -WhatIf', 'PowerShell'],
  ['grep -rn "DROP TABLE" docs', 'Bash'],
  ['Select-String -Pattern "TRUNCATE TABLE" -Path schema.sql', 'PowerShell'],
  ["cat > migrate.sql <<'EOF'\nDROP TABLE old;\nTRUNCATE TABLE t;\nEOF", 'Bash'],
  ['Set-Content -Path m.sql -Value "DROP DATABASE prod"', 'PowerShell'],
  ['git commit -m "docs: explain DROP TABLE"', 'Bash'],
  ['grep -rn "DROP TABLE" docs/psql/', 'Bash'],
  ['grep "DROP TABLE" psql.log', 'Bash'],
] as const
test('review-9：誤報去掉（-WhatIf、-Recurse:$false、沒有呼叫 SQL 用戶端的 DROP／TRUNCATE）', () => {
  for (const [command, tool] of FALSE_POSITIVES_BEFORE) expect([command, hit(command, tool)]).toEqual([command, undefined])
})

test('review-9：呼叫 SQL 用戶端時 DROP／TRUNCATE 照樣抓（含 heredoc、管線、Invoke-Sqlcmd、duckdb）', () => {
  expect(hit('psql -c "DROP TABLE users"')).toBe('drop-sql')
  expect(hit('sqlite3 a.db "drop table t"')).toBe('drop-sql')
  expect(hit('mysql -e "TRUNCATE TABLE logs"')).toBe('truncate-sql')
  expect(hit('sqlcmd -Q "DROP DATABASE prod"', 'PowerShell')).toBe('drop-sql')
  expect(hit('Invoke-Sqlcmd -Query "DROP TABLE x"', 'PowerShell')).toBe('drop-sql')
  expect(hit('duckdb db.duckdb "DROP TABLE t"')).toBe('drop-sql')
  expect(hit('echo "DROP TABLE x" | psql')).toBe('drop-sql')
  expect(hit('psql <<SQL\nDROP\nTABLE users;\nSQL')).toBe('drop-sql')
  expect(hit('docker exec db psql -U app -c "TRUNCATE TABLE sessions"')).toBe('truncate-sql')
})

test('review-9：沒有退步——原本要抓的、原本放行的照舊；引號裡的文字仍會問（已記載的取捨）', () => {
  expect(hit('Remove-Item x -Recurse', 'PowerShell')).toBe('remove-item-recurse')
  expect(hit('rm -Recurse -Force x', 'PowerShell')).toBe('remove-item-recurse')
  expect(hit('git push origin main')).toBeUndefined()
  expect(hit('git push origin HEAD:main')).toBeUndefined()
  expect(hit('git push --dry-run')).toBeUndefined()
  expect(hit('git stash')).toBeUndefined()
  expect(hit('git stash push -m drop')).toBeUndefined()
  expect(hit('git stash pop')).toBeUndefined()
  expect(hit('robocopy src dst /E')).toBeUndefined()
  expect(hit('Get-ChildItem -Recurse | Select-Object Name', 'PowerShell')).toBeUndefined()
  expect(hit('grep shutil.rmtree src')).toBeUndefined()
  expect(hit('python -c "print(1)"')).toBeUndefined()
  expect(hit('[IO.Directory]::Delete("x", $false)', 'PowerShell')).toBeUndefined()
  expect(hit('git commit -m "never git reset --hard here"')).toBe('reset-hard')
})
