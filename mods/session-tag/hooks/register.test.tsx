import { expect, test } from 'claude-code/testing'

import { buildRows, tagMissing } from './register'

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
  await tagMissing($, (done, total) => void seen.push([done, total]))
  expect(calls).toHaveLength(20)
  expect(seen[seen.length - 1]).toEqual([20, 20])
})

test('tagMissing does not count a session without a prompt in the 20 model calls', async () => {
  const files: Record<string, { mtimeMs: number; head: string }> = {}
  for (let i = 1; i <= 25; i++) {
    files[id(i)] = { mtimeMs: i, head: i > 20 ? JSON.stringify({ type: 'assistant' }) : prompt(`task ${i}`) }
  }
  const { $, calls } = fake(files, () => ok('Tag'))
  await tagMissing($, () => {})
  expect(calls).toHaveLength(20)
})

test('tagMissing tries a session without a prompt again on the next run', async () => {
  const files = { [id(1)]: { mtimeMs: 1, head: '' } }
  const { $, calls, store } = fake(files, () => ok('Tag'))
  await tagMissing($, () => {})
  expect(store.has(id(1))).toBe(false)
  files[id(1)]!.head = prompt('now typed')
  await tagMissing($, () => {})
  expect(calls).toHaveLength(1)
  expect(store.get(id(1))).toEqual({ tag: 'Tag', done: false })
})

test('tagMissing keeps going when the progress callback throws', async () => {
  const { $, store } = fake(
    { [id(1)]: { mtimeMs: 1, head: prompt('a') }, [id(2)]: { mtimeMs: 2, head: prompt('b') } },
    () => ok('Tag'),
  )
  await tagMissing($, async () => {
    throw new Error('draw failed')
  })
  expect(store.has(id(1))).toBe(true)
  expect(store.has(id(2))).toBe(true)
})

test('buildRows labels a session whose file cannot be read', async () => {
  const { $ } = fake({ [id(1)]: { mtimeMs: 1, head: prompt('a') }, [id(2)]: { mtimeMs: 2, head: prompt('b') } }, () => ok('Tag'))
  const run = $.process.run
  $.process.run = async (argv: string[]) => {
    if (argv[0] === 'head' && argv[argv.length - 1]!.includes(id(1))) throw new Error('gone')
    return run(argv)
  }
  const rows = await buildRows($)
  expect(rows).toHaveLength(2)
  expect(rows.find(r => r.id === id(1))?.label).toBe('(unreadable)')
  expect(rows.find(r => r.id === id(2))?.label).toBe('b')
})

// ---- the command and the pane, through the engine's own events ----

const PANE = {
  plugin: 'session-tag',
  component: 'Pane',
  requestId: 'session-tag',
  surface: 'terminal',
  props: { title: 'Session tags', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

function engine(on: any, files: Record<string, { mtimeMs: number; head: string }>, stored: Record<string, unknown> = {}, current = 'current', extra: { elsewhere?: string[]; gate?: Promise<void>; free?: number; calls?: string[]; find?: 'fails' | 'throws' } = {}) {
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
    if (argv[0] === 'find') {
      if (extra.find === 'throws') throw new Error('find failed')
      const own = Object.keys(files).map(id => `${PROJECT}/${id}.jsonl`)
      const other = (extra.elsewhere ?? []).map(id => `/h/.claude/projects/-q/${id}.jsonl`)
      return { value: { stdout: [...own, ...other].join('\n'), stderr: '', exitCode: extra.find === 'fails' ? 1 : 0 } }
    }
    if (argv[0] === 'printenv') return { value: { stdout: '/h\n', stderr: '', exitCode: 0 } }
    if (argv[0] === 'pwd') return { value: { stdout: '/p\n', stderr: '', exitCode: 0 } }
    const id = argv[argv.length - 1]!.replace(`${PROJECT}/`, '').replace('.jsonl', '')
    return { value: { stdout: files[id]?.head ?? '', stderr: '', exitCode: 0 } }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.get', (_: any, e: any) => ({ value: store.get(e.key) }))
  on('store.set', (_: any, e: any) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_: any, e: any) => (store.delete(e.key), { value: undefined }))
  let n = 0
  on('model.complete', async () => {
    extra.calls?.push('call')
    n += 1
    if (extra.gate && n > (extra.free ?? 1)) await extra.gate
    return { value: { isAnswered: true, text: 'Tag' } }
  })
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
  let release = () => {}
  const gate = new Promise<void>(r => (release = r))
  engine(on, two, {}, 'current', { gate })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'session-tag' } as any)
  await new Promise(r => setTimeout(r, 20))
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /Tagging 1\/2/ }))?.text).toBe('Tagging 1/2')
  release()
  await ui.unmount()
})

test('a second command run while tagging does not start a second pass', async ($, on) => {
  let release = () => {}
  const gate = new Promise<void>(r => (release = r))
  const calls: string[] = []
  engine(on, two, {}, 'current', { gate, calls, free: 0 })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'session-tag' } as any)
  await $.command.run({ command: 'session-tag' } as any)
  await new Promise(r => setTimeout(r, 20))
  expect(calls).toHaveLength(1)
  release()
})

test('opening the pane keeps the entries of sessions in other projects', async ($, on) => {
  const { store } = engine(on, two, { [id(9)]: { tag: 'Keep', done: true }, gone: { tag: 'x', done: false } }, 'current', { elsewhere: [id(9)] })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'session-tag' } as any)
  expect(store.has(id(9))).toBe(true)
  expect(store.has('gone')).toBe(false)
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

test('opening the pane deletes nothing when find fails with partial output', async ($, on) => {
  const { store } = engine(on, two, { [id(9)]: { tag: 'Keep', done: true } }, 'current', { find: 'fails' })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'session-tag' } as any)
  expect(store.has(id(9))).toBe(true)
})

test('the command still opens the pane when find throws', async ($, on) => {
  const { opened } = engine(on, two, {}, 'current', { find: 'throws' })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'session-tag' } as any)
  expect(r.text).toBe('Session tag list opened.')
  expect(opened).toEqual(['session-tag'])
})
