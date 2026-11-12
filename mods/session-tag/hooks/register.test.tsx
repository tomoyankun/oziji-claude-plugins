import { expect, test } from 'claude-code/testing'

import { tagMissing } from './register'

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
        const id = argv[argv.length - 1].replace(`${PROJECT}/`, '').replace('.jsonl', '')
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
