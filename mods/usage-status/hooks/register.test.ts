import { expect, test } from 'claude-code/testing'

import { CAUTION_PERCENT, DANGER_PERCENT, barSvg, buildSegments, detectTeammate, isHiddenView, isTeammatePane, levelOf, parseToggle } from './register'

test('builds a gauge segment per window and for tokens', () => {
  const segments = buildSegments({ tokens: 45_000, window: 200_000, percent: 23 }, [
    { kind: 'five_hour', percentUsed: 12.5 },
    { kind: 'seven_day', percentUsed: 85 },
  ])
  expect(segments.map(s => s.text)).toEqual([
    '5h █░░░░░░░░░ 12.5%',
    '7d █████████░ 85%',
    'context ██░░░░░░░░ 45k/200k (23%)',
  ])
  expect(segments.map(s => s.percent)).toEqual([12.5, 85, 23])
})

test('appends the reset time in local time', () => {
  const resetsAt = new Date(2026, 9, 9, 15, 5).toISOString()
  const segments = buildSegments({ window: 200_000 }, [
    { kind: 'five_hour', percentUsed: 38, resetsAt },
    { kind: 'seven_day', percentUsed: 36, resetsAt },
  ])
  expect(segments.map(s => s.text)).toEqual([
    '5h ████░░░░░░ 38% ↻ 15:05',
    '7d ████░░░░░░ 36% ↻ 10/9 15:05',
    'context ░░░░░░░░░░ 0/200k (0%)',
  ])
})

test('omits the reset time when it is missing or invalid', () => {
  const segments = buildSegments({ window: 200_000 }, [
    { kind: 'five_hour', percentUsed: 38 },
    { kind: 'seven_day', percentUsed: 36, resetsAt: 'invalid' },
  ])
  expect(segments.map(s => s.text).slice(0, 2)).toEqual(['5h ████░░░░░░ 38%', '7d ████░░░░░░ 36%'])
})

test('shows only tokens off a subscription', () => {
  expect(buildSegments({ window: 200_000 }, [])).toMatchObject([{ text: 'context ░░░░░░░░░░ 0/200k (0%)', percent: 0, label: 'context' }])
})

test('classifies a segment into three levels', () => {
  const level = (percent: number) => levelOf({ text: '', percent })

  expect(level(0)).toBe('ok')
  expect(level(CAUTION_PERCENT - 0.1)).toBe('ok')
  expect(level(CAUTION_PERCENT)).toBe('caution')
  expect(level(DANGER_PERCENT - 0.1)).toBe('caution')
  expect(level(DANGER_PERCENT)).toBe('danger')
  expect(level(100)).toBe('danger')
})

test('hides the band in an agent transcript or during a survey', () => {
  expect(isHiddenView({ hasSurvey: false, view: {} })).toBe(false)
  expect(isHiddenView({ hasSurvey: false, view: { agentId: 'agent-1' } })).toBe(true)
  expect(isHiddenView({ hasSurvey: true, view: {} })).toBe(true)
  expect(isHiddenView({ hasSurvey: false })).toBe(false)
})

test('detects a tmux teammate pane from the team config', () => {
  const configs = [
    {
      members: [
        { backendType: 'in-process', tmuxPaneId: 'leader' },
        { backendType: 'tmux', tmuxPaneId: '%13' },
      ],
    },
  ]

  expect(isTeammatePane(configs, '%13')).toBe(true)
  expect(isTeammatePane(configs, '%1')).toBe(false)
  expect(isTeammatePane(configs, 'leader')).toBe(false)
  expect(isTeammatePane(configs, undefined)).toBe(false)
  expect(isTeammatePane([], '%13')).toBe(false)
})

test('parseToggle flips without args and obeys on / off', () => {
  expect(parseToggle('', true)).toBe(false)
  expect(parseToggle('  ', false)).toBe(true)
  expect(parseToggle('on', false)).toBe(true)
  expect(parseToggle('OFF', true)).toBe(false)
  expect(parseToggle('maybe', true)).toBeUndefined()
})

test('splits a segment into label, value and reset for the pane', () => {
  const resetsAt = new Date(2026, 9, 9, 15, 5).toISOString()
  const [five, seven] = buildSegments({ window: 200_000 }, [
    { kind: 'five_hour', percentUsed: 38, resetsAt },
    { kind: 'seven_day', percentUsed: 36 },
  ])

  expect([five?.label, five?.value, five?.reset]).toEqual(['5h', '38%', '15:05'])
  expect(seven?.reset).toBe('')
})

test('draws the bar fill in proportion to the percent', () => {
  expect(barSvg(50, 'ok')).toContain('width="100" height="10" rx="5" fill="#2e9e5b"')
  expect(barSvg(0, 'ok')).not.toContain('#2e9e5b')
  expect(barSvg(150, 'danger')).toContain('width="200" height="10" rx="5" fill="#d64545"')
})

test('detectTeammate ignores a stale team whose lead process is gone', async () => {
  const team = (pid: number | undefined) =>
    JSON.stringify({ leadProcess: pid === undefined ? undefined : { pid }, members: [{ backendType: 'tmux', tmuxPaneId: '%1' }] })
  const make = (configs: Record<string, string>, alivePids: number[]) =>
    ({
      env: { get: async () => '/home' },
      fs: {
        list: async () => Object.keys(configs).map(name => ({ name })),
        read: async (path: string) => configs[path.split("/")[4] as string],
      },
      process: {
        run: async (argv: string[]) => ({ exitCode: alivePids.includes(Number(argv[2])) ? 0 : 1 }),
      },
    }) as never

  expect(await detectTeammate(make({ a: team(100) }, [100]), '%1')).toBe(true)
  expect(await detectTeammate(make({ a: team(100) }, []), '%1')).toBe(false)
  expect(await detectTeammate(make({ a: team(undefined) }, [100]), '%1')).toBe(false)
  expect(await detectTeammate(make({ a: team(100) }, [100]), '%9')).toBe(false)
})
