// 和其他 mod 並存：另一個 mod（例如 progress）也畫輸入框上方（AbovePrompt）。面板沒開時 ctx-handoff 必須 next(e)，把畫面讓給下層
import { expect } from 'claude-code/testing'
import { test, BAND_MOUNT, cmd, NOTES_PATH, PANEL_NOTES, world } from './test-world'

test('AbovePrompt：面板關著時交給下層（不畫任何東西、不吞掉別的 mod 的畫面）', async ($, on) => {
  const w = world(on, 1000)
  w.files.set(NOTES_PATH, PANEL_NOTES)
  // 下層（另一個 mod 或引擎自己）畫的橫條
  on('ui.render', () => h('Text', null, '別的 mod 的橫條') as never)
  const ui = await $.ui.mount(BAND_MOUNT)
  expect(await ui.find({ type: 'Text', text: '別的 mod 的橫條' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'ctx-handoff' })).toBeUndefined()
  await ui.unmount()
  // 開著、被問卷佔住時也讓出
  await cmd($, 'panel')
  const survey = await $.ui.mount({ ...BAND_MOUNT, props: { ...BAND_MOUNT.props, hasSurvey: true } })
  expect(await survey.find({ type: 'Text', text: '別的 mod 的橫條' })).toBeDefined()
  expect(await survey.find({ type: 'Text', text: 'ctx-handoff' })).toBeUndefined()
  await survey.unmount()
  // 開著且沒有問卷：畫自己的面板
  const open = await $.ui.mount(BAND_MOUNT)
  expect(await open.find({ type: 'Text', text: 'ctx-handoff' })).toBeDefined()
  expect(await open.find({ type: 'Text', text: '別的 mod 的橫條' })).toBeUndefined()
  // 關掉之後又回到下層
  await open.press({ key: 'close' })
  expect(await open.find({ type: 'Text', text: '別的 mod 的橫條' })).toBeDefined()
  expect(await open.find({ type: 'Text', text: 'ctx-handoff' })).toBeUndefined()
  await open.unmount()
  const closed = await $.ui.mount(BAND_MOUNT)
  expect(await closed.find({ type: 'Text', text: '別的 mod 的橫條' })).toBeDefined()
  await closed.unmount()
})

test('AbovePrompt：從來沒開過面板、也沒有任何狀態的 session，同樣讓給下層', async ($, on) => {
  world(on, 1000)
  on('ui.render', () => h('Text', null, '別的 mod 的橫條') as never)
  const ui = await $.ui.mount({ ...BAND_MOUNT, props: { ...BAND_MOUNT.props, isWorking: true } })
  expect(await ui.find({ type: 'Text', text: '別的 mod 的橫條' })).toBeDefined()
  await ui.unmount()
})
