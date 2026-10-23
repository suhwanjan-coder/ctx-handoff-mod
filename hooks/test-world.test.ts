import { expect } from 'claude-code/testing'
import { test } from './test-world'

// 不建立模擬時鐘，實際等待超過框架原本的 5 秒，驗證共用預設時限。
test('共用時限：未指定 timeoutMs，真實等待 6 秒仍通過', async () => {
  const started = Date.now()
  const { setTimeout } = globalThis as unknown as { setTimeout: (body: () => void, ms: number) => unknown }
  await new Promise<void>(resolve => setTimeout(resolve, 6000))
  expect(Date.now() - started).toBeGreaterThanOrEqual(6000)
})
