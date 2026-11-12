import { expect, test } from 'claude-code/testing'

import { tagMissing } from './register'

declare const setTimeout: (f: (...a: any[]) => void, ms: number) => unknown

const PROJECT = '/h/.claude/projects/-p'
const prompt = (text: string) => JSON.stringify({ type: 'user', message: { content: text } })

type Reply = { isAnswered: boolean; text?: string }

// A hand-made `$`: the files of one project, an in-memory store, a scripted model.
function fake(
  files: Record<string, { mtimeMs: number; head: string }>,
  model: (prompt: string) => Reply,
  stored: Record<string, unknown> = {},
) {
  const store = new Map<string, unknown>(Object.entries(stored))
  const calls: string[] = []
  const $ = {
    session: { id: async () => 'current' },
    fs: {
      list: async () =>
        Object.entries(files).map(([id, f]) => ({ kind: 'file', name: `${id}.jsonl`, mtimeMs: f.mtimeMs })),
    },
    process: {
      run: async (argv: string[]) => {
        if (argv[0] === 'printenv') return { stdout: '/h\n' }
        if (argv[0] === 'pwd') return { stdout: '/p\n' }
        const id = argv[argv.length - 1]!.replace(`${PROJECT}/`, '').replace('.jsonl', '')
        return { stdout: files[id]?.head ?? '' }
      },
    },
    store: {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: unknown) => void store.set(k, v),
      delete: async (k: string) => void store.delete(k),
      keys: async () => [...store.keys()],
    },
    model: {
      complete: async (r: { prompt: string }) => {
        calls.push(r.prompt)
        return model(r.prompt)
      },
    },
  }
  return { $, store, calls }
}

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const ok = (text: string): Reply => ({ isAnswered: true, text })

test('tagMissing stores a cleaned tag for each untagged session', async () => {
  const { $, store } = fake(
    { [id(1)]: { mtimeMs: 1, head: prompt('fix the bug') }, [id(2)]: { mtimeMs: 2, head: prompt('add a mod') } },
    () => ok('"Add\na mod"'),
  )
  await tagMissing($, () => {})
  expect(store.get(id(1))).toEqual({ tag: 'Add a mod', done: false })
  expect(store.get(id(2))).toEqual({ tag: 'Add a mod', done: false })
})

test('tagMissing keeps going when one model call fails', async () => {
  const { $, store } = fake(
    { [id(1)]: { mtimeMs: 1, head: prompt('first') }, [id(2)]: { mtimeMs: 2, head: prompt('second') } },
    p => (p.includes('second') ? { isAnswered: false } : ok('Tag')),
  )
  await tagMissing($, () => {})
  expect(store.has(id(2))).toBe(false)
  expect(store.get(id(1))).toEqual({ tag: 'Tag', done: false })
})

test('tagMissing does not call the model for a session without a prompt', async () => {
  const { $, store, calls } = fake({ [id(1)]: { mtimeMs: 1, head: JSON.stringify({ type: 'assistant' }) } }, () => ok('Tag'))
  await tagMissing($, () => {})
  expect(calls).toHaveLength(0)
  expect(store.has(id(1))).toBe(false)
})

test('tagMissing keeps an existing done flag', async () => {
  const { $, store } = fake(
    { [id(1)]: { mtimeMs: 1, head: prompt('x') } },
    () => ok('Tag'),
    { [id(1)]: { tag: '', done: true } },
  )
  await tagMissing($, () => {})
  expect(store.get(id(1))).toEqual({ tag: 'Tag', done: true })
})

test('tagMissing processes at most 20 sessions', async () => {
  const files: Record<string, { mtimeMs: number; head: string }> = {}
  for (let i = 1; i <= 25; i++) files[id(i)] = { mtimeMs: i, head: prompt(`task ${i}`) }
  const { $, calls } = fake(files, () => ok('Tag'))
  const seen: [number, number][] = []
  await tagMissing($, (done, total) => seen.push([done, total]))
  expect(calls).toHaveLength(20)
  expect(seen[seen.length - 1]).toEqual([20, 20])
})

// ---- the command and the pane, through the engine's own events ----

const PANE = {
  plugin: 'session-tag',
  component: 'Pane',
  requestId: 'session-tag',
  surface: 'terminal',
  props: { title: 'Session tags', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

function engine(on: any, files: Record<string, { mtimeMs: number; head: string }>, stored: Record<string, unknown> = {}, current = 'current') {
  const store = new Map<string, unknown>(Object.entries(stored))
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'session-tag' } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('ui.open', (_: any, e: any) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('session.id', () => ({ value: current }))
  on('fs.list', () => ({
    value: Object.entries(files).map(([id, f]) => ({ kind: 'file', name: `${id}.jsonl`, mtimeMs: f.mtimeMs })),
  }))
  on('process.run', (_: any, e: any) => {
    const argv: string[] = e.argv
    if (argv[0] === 'printenv') return { value: { stdout: '/h\n', stderr: '', exitCode: 0 } }
    if (argv[0] === 'pwd') return { value: { stdout: '/p\n', stderr: '', exitCode: 0 } }
    const id = argv[argv.length - 1]!.replace(`${PROJECT}/`, '').replace('.jsonl', '')
    return { value: { stdout: files[id]?.head ?? '', stderr: '', exitCode: 0 } }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.get', (_: any, e: any) => ({ value: store.get(e.key) }))
  on('store.set', (_: any, e: any) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_: any, e: any) => (store.delete(e.key), { value: undefined }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Tag' } }))
  return { store, opened }
}

const two = {
  [id(1)]: { mtimeMs: 1, head: prompt('first task') },
  [id(2)]: { mtimeMs: 2, head: prompt('second task') },
}

test('the command opens the pane and lists sessions at once', async ($, on) => {
  const { opened } = engine(on, two)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'session-tag' } as any)
  expect(r.text).toBe('Session tag list opened.')
  expect(opened).toEqual(['session-tag'])
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Select', key: 'session' })).toBeDefined()
  await ui.unmount()
})

test('the pane shows Tagging n/m while tags are generated', async ($, on) => {
  engine(on, two)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'session-tag' } as any)
  await new Promise(r => setTimeout(r, 20))
  const ui = await $.ui.mount(PANE)
  const select = await ui.find({ type: 'Select', key: 'session' })
  expect(JSON.stringify(select)).toContain('Tag')
  await ui.unmount()
})

test('selecting a session toggles its done flag', async ($, on) => {
  const { store } = engine(on, two, { [id(1)]: { tag: 'Old', done: false } })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'session-tag' } as any)
  const ui = await $.ui.mount(PANE)
  await ui.select({ key: 'session', value: id(1) })
  expect(store.get(id(1))).toEqual({ tag: 'Old', done: true })
  await ui.select({ key: 'session', value: id(1) })
  expect(store.get(id(1))).toEqual({ tag: 'Old', done: false })
  await ui.unmount()
})

test('selecting the current session changes nothing', async ($, on) => {
  const now = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  const { store } = engine(on, { ...two, [now]: { mtimeMs: 3, head: prompt('now') } }, {}, now)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'session-tag' } as any)
  const ui = await $.ui.mount(PANE)
  await ui.select({ key: 'session', value: now })
  expect(store.has(now)).toBe(false)
  await ui.unmount()
})

test('opening the pane removes entries whose file is gone', async ($, on) => {
  const { store } = engine(on, two, { gone: { tag: 'x', done: true }, [id(1)]: { tag: 'Old', done: false } })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'session-tag' } as any)
  expect(store.has('gone')).toBe(false)
  expect(store.has(id(1))).toBe(true)
})
