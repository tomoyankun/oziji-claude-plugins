import { expect, mock, test } from 'claude-code/testing'

const NOTIFICATION = {
  session_id: 's',
  transcript_path: '/t',
  cwd: '/',
  hook_event_name: 'Notification',
  title: '',
} as const

// エンジンの代わりに、process.run と ui を受ける。
function engine(on: Parameters<typeof mock.clock>[0]) {
  const argvs: (readonly string[])[] = []
  const opened: string[] = []
  const closed: string[] = []
  on('process.run', (_, e) => {
    argvs.push(e.argv)
    const out = e.argv[0] === 'uname' ? 'Linux 6.0 microsoft-standard' : '/win/path'
    return {
      value: {
        exitCode: 0,
        stdout: out,
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  return { argvs, opened, closed }
}

test('permission_prompt: 音を鳴らし、ペインを開く', async ($, on) => {
  const clock = mock.clock(on)
  const world = engine(on)
  on('classic.Notification', () => ({}))
  on('classic.PostToolUse', () => ({}))

  await $.classic.Notification({
    ...NOTIFICATION,
    notification_type: 'permission_prompt',
    message: '許可が必要です',
  })
  await clock.settle()

  expect(world.opened).toEqual(['notify-on-wait'])
  expect(world.argvs.some(a => a[0] === 'powershell.exe')).toBe(true)

  await $.classic.PostToolUse({
    ...NOTIFICATION,
    tool_name: 'Bash',
    tool_input: {},
    tool_response: {},
    tool_use_id: 'u',
  })
  expect(world.closed).toEqual(['notify-on-wait'])
})

test('通知が重なっても、ペインは1回だけ開く', async ($, on) => {
  const clock = mock.clock(on)
  const world = engine(on)
  on('classic.Notification', () => ({}))
  on('classic.PostToolUse', () => ({}))

  for (let i = 0; i < 2; i++) {
    await $.classic.Notification({
      ...NOTIFICATION,
      notification_type: 'permission_prompt',
      message: 'm',
    })
  }
  await clock.settle()

  expect(world.opened).toEqual(['notify-on-wait'])

  await $.classic.PostToolUse({
    ...NOTIFICATION,
    tool_name: 'Bash',
    tool_input: {},
    tool_response: {},
    tool_use_id: 'u',
  })
})

test('対象外の notification_type では、何も起きない', async ($, on) => {
  const clock = mock.clock(on)
  const world = engine(on)
  on('classic.Notification', () => ({}))

  await $.classic.Notification({
    ...NOTIFICATION,
    notification_type: 'idle_prompt',
    message: 'm',
  })
  await clock.settle()

  expect(world.opened).toEqual([])
  expect(world.argvs).toEqual([])
})

test('worker_permission_prompt: 30秒たつと、点滅が止まる', async ($, on) => {
  const clock = mock.clock(on)
  const world = engine(on)
  on('classic.Notification', () => ({}))

  await $.classic.Notification({
    ...NOTIFICATION,
    notification_type: 'worker_permission_prompt',
    message: 'AskUserQuestion',
  })
  await clock.advance(29000)
  expect(world.closed).toEqual([])

  await clock.advance(1500)
  expect(world.closed).toEqual(['notify-on-wait'])
})
