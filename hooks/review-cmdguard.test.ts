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


// ---------- review2：B 到 E ----------

test('review2-B：-WhatIf:$false 是真的執行，不算預演；單獨的 -WhatIf 與 -WhatIf:$true 才是', () => {
  expect(hit('Remove-Item x -Recurse -WhatIf:$false', 'PowerShell')).toBe('remove-item-recurse')
  expect(hit('Remove-Item x -Recurse -whatif:false', 'PowerShell')).toBe('remove-item-recurse')
  expect(hit('Get-ChildItem x -Recurse | Remove-Item -WhatIf:$false', 'PowerShell')).toBe('remove-item-recurse')
  expect(hit('Remove-Item x -Recurse -WhatIf', 'PowerShell')).toBeUndefined()
  expect(hit('Remove-Item x -Recurse -WhatIf:$true', 'PowerShell')).toBeUndefined()
  expect(hit('Get-ChildItem x -Recurse | Remove-Item -WhatIf:$true', 'PowerShell')).toBeUndefined()
})

test('review2-C：python -c／node -e 用 SQL 函式庫執行 DROP／TRUNCATE 也抓；bq 算 SQL 用戶端；grep／Select-String 仍安靜', () => {
  expect(hit(`python -c "import sqlite3; c=sqlite3.connect('h.db'); c.execute('DROP TABLE x')"`)).toBe('drop-sql')
  expect(hit(`python3 -c "import sqlite3;sqlite3.connect('h.db').execute('TRUNCATE TABLE x')"`)).toBe('truncate-sql')
  expect(hit(`python -c "import psycopg2; psycopg2.connect().cursor().execute('DROP DATABASE prod')"`)).toBe('drop-sql')
  expect(hit(`node -e "require('sqlite3'); db.run('DROP TABLE x')"`)).toBe('drop-sql')
  expect(hit(`node -e "const db=require('better-sqlite3')('a.db'); db.exec('DROP TABLE x')"`)).toBe('drop-sql')
  expect(hit('bq query "DROP TABLE ds.t"')).toBe('drop-sql')
  expect(hit('sqlite3;psql -c "DROP TABLE x"')).toBe('drop-sql')
  expect(hit('grep -rn "drop table" src')).toBeUndefined()
  expect(hit('Select-String -Pattern "DROP TABLE" -Path a.sql', 'PowerShell')).toBeUndefined()
  expect(hit('python -c "print(\'DROP TABLE x\')"')).toBeUndefined()
  expect(hit('node -e "console.log(\'DROP TABLE x\')"')).toBeUndefined()
  expect(hit('grep "DROP TABLE" psql.log')).toBeUndefined()
  expect(hit('grep -rn "DROP TABLE" docs/psql/')).toBeUndefined()
})

test('review2-D：引號裡的路徑有 & 或 ; 不會把指令切斷；包裝的程式碼引號裡的分隔符號照樣是分隔符號', () => {
  expect(hit('Remove-Item "D:\\OneDrive\\文件\\R&D" -Recurse -Force', 'PowerShell')).toBe('remove-item-recurse')
  expect(hit('Remove-Item "D:\\a;b" -Recurse', 'PowerShell')).toBe('remove-item-recurse')
  expect(hit("Remove-Item 'D:\\x|y' -Recurse -Force", 'PowerShell')).toBe('remove-item-recurse')
  expect(hit('rm -rf "my&dir;x|y"')).toBe('rm-r')
  expect(hit('git push --force "origin" "ma;in"')).toBe('push-force')
  // 包裝的程式碼：裡面的分隔符號要保留，後面的指令才看得到
  expect(hit('bash -c "ls && rm -rf x"')).toBe('rm-r')
  expect(hit('powershell -Command "Get-ChildItem x; Remove-Item y -Recurse"', 'PowerShell')).toBe('remove-item-recurse')
  expect(hit('cmd /c "dir & rd /s /q build"')).toBe('del-s')
  expect(hit("sh -c 'cd a; git reset --hard'")).toBe('reset-hard')
  // 沒有收尾的引號當普通字元；引號資料裡的分隔符號不會把 -Recurse 和下游接起來
  expect(hit('echo it\'s ok; rm -rf build')).toBe('rm-r')
  expect(hit('Get-ChildItem "a|b" -Recurse | Select-Object Name', 'PowerShell')).toBeUndefined()
})

test('review2-E：robocopy /L（只列出）不問；rmdir /s/foo 是路徑不問，rd/s/q 仍問；單一檔案接 -Recurse 清單仍問（刻意）', () => {
  expect(hit('robocopy src dst /MIR /L')).toBeUndefined()
  expect(hit('robocopy src dst /MIR /l /NJH')).toBeUndefined()
  expect(hit('robocopy src dst /PURGE /L /E')).toBeUndefined()
  expect(hit('robocopy src dst /MIR')).toBe('robocopy-mir')
  expect(hit('rmdir /s/foo')).toBeUndefined()
  expect(hit('cmd /c rmdir /s/foo/bar')).toBeUndefined()
  expect(hit('rd/s/q build')).toBe('del-s')
  expect(hit('rmdir /s/q build')).toBe('del-s')
  expect(hit('rmdir /s /q build')).toBe('del-s')
  expect(hit('rd/s/q/f build')).toBe('del-s')
  expect(hit('rmdir /s')).toBe('del-s')
  // 設計如此：上游是 -Recurse 的清單，下游接 Remove-Item 就問，即使只寫了一個檔名
  expect(hit('Get-ChildItem -Recurse | Remove-Item a.txt', 'PowerShell')).toBe('remove-item-recurse')
})
