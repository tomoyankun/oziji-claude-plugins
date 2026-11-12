import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Row } from '../types'
import { cleanTag, dateOf, firstPrompt, pickTargets, staleIds } from './tags'
import type { Entry, SessionFile } from './tags'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HEAD_BYTES = '65536'
const MAX_TAGGED = 20
const MAX_ROWS = 100
const PANE = 'session-tag'
const NO_PROMPT = '(no prompt)'

const rows = atom({ plugin: 'session-tag', key: 'rows' } as const, [], { shape: 'rows-1' })
const progress = atom({ plugin: 'session-tag', key: 'progress' } as const, '', { shape: 'progress-1' })

// The label of a session: the first prompt, cut to 40 characters. Kept until the module reloads.
const labels = new Map<string, string>()

export async function projectDir($: any): Promise<string> {
  const home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
  const cwd = (await $.process.run(['pwd'])).stdout.trim()
  return `${home}/.claude/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}`
}

export async function loadFiles($: any): Promise<SessionFile[]> {
  const entries = await $.fs.list(await projectDir($))
  return entries
    .filter((f: any) => f.kind === 'file' && f.name.endsWith('.jsonl'))
    .map((f: any) => ({ id: f.name.slice(0, -6), mtimeMs: f.mtimeMs }))
    .filter((f: SessionFile) => UUID.test(f.id))
}

export async function readEntries($: any): Promise<Map<string, Entry>> {
  const map = new Map<string, Entry>()
  for (const key of await $.store.keys()) {
    const value = (await $.store.get(key)) as Entry | undefined
    if (value && typeof value.tag === 'string') map.set(key, value)
  }
  return map
}

async function generateTag($: any, text: string): Promise<string | undefined> {
  const r = await $.model.complete({
    model: 'haiku',
    prompt: `Reply with a tag of at most 20 characters that names this task. Reply with the tag only.\n\n${text}`,
  })
  if (!r.isAnswered) return undefined
  return cleanTag(r.text ?? '') || undefined
}

// Tags the newest untagged sessions, one at a time. A failed model call leaves the session
// untagged. A session without a typed prompt gets the NO_PROMPT tag and is not tried again.
export async function tagMissing(
  $: any,
  onProgress: (done: number, total: number) => void | Promise<void>,
): Promise<void> {
  const project = await projectDir($)
  const files = await loadFiles($)
  const entries = await readEntries($)
  const targets = pickTargets(files, entries, await $.session.id(), MAX_TAGGED)
  let done = 0
  for (const id of targets) {
    try {
      const head = (await $.process.run(['head', '-c', HEAD_BYTES, `${project}/${id}.jsonl`])).stdout
      const text = firstPrompt(head)
      const tag = text === undefined ? NO_PROMPT : await generateTag($, text)
      if (tag !== undefined) {
        const current = (await $.store.get(id)) as Entry | undefined
        await $.store.set(id, { tag, done: current?.done ?? false })
      }
    } catch {
      // One failed session must not stop the others.
    }
    done += 1
    try {
      await onProgress(done, targets.length)
    } catch {
      // A failed redraw must not stop the tagging.
    }
  }
}

async function labelOf($: any, project: string, id: string): Promise<string> {
  const known = labels.get(id)
  if (known !== undefined) return known
  try {
    const head = (await $.process.run(['head', '-c', HEAD_BYTES, `${project}/${id}.jsonl`])).stdout
    const label = firstPrompt(head)?.slice(0, 40) ?? NO_PROMPT
    labels.set(id, label)
    return label
  } catch {
    // Not cached: the next refresh reads the file again.
    return '(unreadable)'
  }
}

export async function buildRows($: any): Promise<Row[]> {
  const project = await projectDir($)
  const files = (await loadFiles($)).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, MAX_ROWS)
  const entries = await readEntries($)
  const current = await $.session.id()
  const list: Row[] = []
  for (const f of files) {
    const entry = entries.get(f.id)
    list.push({
      id: f.id,
      date: dateOf(f.mtimeMs),
      tag: entry?.tag ?? '',
      done: entry?.done ?? false,
      current: f.id === current,
      label: await labelOf($, project, f.id),
    })
  }
  return list
}

export function textOf(r: Row): string {
  const mark = r.current ? '(current)' : r.done ? '[done]' : '[    ]'
  return `${r.date}  ${mark} ${r.tag || '(untagged)'}  ${r.label}`
}

async function refresh($: any) {
  const list = await buildRows($)
  await update($, rows, () => list)
}

// The ids of the session files in every project. The store is shared by all projects.
async function allSessionIds($: any): Promise<string[]> {
  const home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
  const r = await $.process.run(['find', `${home}/.claude/projects`, '-maxdepth', '2', '-name', '*.jsonl'])
  // A failed find may print a partial list. Treat it as no answer.
  if (r.exitCode !== 0) return []
  return r.stdout
    .split('\n')
    .map((p: string) => p.slice(p.lastIndexOf('/') + 1, -'.jsonl'.length))
    .filter((id: string) => UUID.test(id))
}

async function pruneStale($: any) {
  const ids = await allSessionIds($)
  // An empty answer means the listing failed. Delete nothing then.
  if (ids.length === 0) return
  for (const key of staleIds(await $.store.keys(), ids)) await $.store.delete(key)
}

async function toggleDone($: any, id: string) {
  if (id === (await $.session.id())) return
  const entry = (await $.store.get(id)) as Entry | undefined
  await $.store.set(id, { tag: entry?.tag ?? '', done: !(entry?.done ?? false) })
  await refresh($)
}

let isTagging = false

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'session-tag',
      description: 'List the sessions of this project with tags. Mark a session done.',
    })
    return next(e)
  })

  on('command.run', { command: 'session-tag' }, async $ => {
    try {
      await pruneStale($)
    } catch {
      // Pruning is housekeeping: the pane opens without it.
    }
    await update($, progress, () => '')
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Session tags', focus: true })
    // Not awaited: the pane shows the list at once and fills the tags in.
    if (!isTagging) {
      isTagging = true
      void tagMissing($, async (done, total) => {
        await update($, progress, () => (done < total ? `Tagging ${done}/${total}` : ''))
        await refresh($)
      })
        .catch(() => {
          // Tagging is best effort: a failure leaves the sessions untagged.
        })
        .finally(() => {
          isTagging = false
        })
    }
    return { text: 'Session tag list opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Select } = $.ui.resolve(e)
    const list = await read($, rows)
    const note = await read($, progress)

    return (
      <Box flexDirection="column">
        {note !== '' && <Text dimColor>{note}</Text>}
        {list.length === 0 ? (
          <Text dimColor>No sessions.</Text>
        ) : (
          <Select
            key="session"
            autoFocus
            label="Session"
            options={list.map(r => ({ value: r.id, label: textOf(r) }))}
            onSelect={(id: string) => toggleDone($, id)}
          />
        )}
      </Box>
    )
  })
}
