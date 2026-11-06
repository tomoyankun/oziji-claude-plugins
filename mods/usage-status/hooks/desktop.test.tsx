import { expect, test } from 'claude-code/testing'

const USAGE = {
  context: { tokens: 45_000, window: 200_000, percent: 23 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 12.5 }],
}

const stubEngine = (on: any) => {
  on('command.register', () => ({ value: { command: 'usage-status' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

test('PromptHint shows gauges on desktop', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'usage-status', component: 'PromptHint', surface,
      props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
    } as any)
    expect((await ui.find({ type: 'Text', text: /context/ }))?.text).toMatch(/45k/)
    await ui.unmount()
  }
})

test('Pane shows gauges on desktop', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'usage-status', component: 'Pane', requestId: 'usage-status', surface: 'desktop',
    props: { title: 'Status', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  } as any)
  expect((await ui.find({ type: 'Text', text: /^Usage$/ }))?.text).toBe('Usage')
  expect(await ui.find({ type: 'Text', text: /context/ })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /45k/ }))?.text).toMatch(/45k\/200k/)
  await ui.unmount()
})
