import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { SessionRow } from '../types'

const PANE = 'session-rm'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HEAD_BYTES = '65536'
const MAX_ROWS = 100

const rows = atom({ plugin: 'session-rm', key: 'rows' } as const, [], {
  shape: 'rows-1',
})
const message = atom({ plugin: 'session-rm', key: 'message' } as const, '', {
  shape: 'message-1',
})

// The first typed prompt in the head of a transcript, cut to 40 characters.
function firstPrompt(head: string): string {
  for (const line of head.split('\n')) {
    try {
      const row = JSON.parse(line)
      if (row.type !== 'user' || row.isSidechain) continue
      const c = row.message?.content
      const text = typeof c === 'string' ? c : c?.find?.((b: any) => b.type === 'text')?.text
      if (typeof text !== 'string' || text.startsWith('<')) continue
      return text.replace(/\s+/g, ' ').trim().slice(0, 40)
    } catch {
      // A truncated or non-JSON line: skip it.
    }
  }
  return '(no prompt)'
}

async function paths($: any) {
  const home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
  const cwd = (await $.process.run(['pwd'])).stdout.trim()
  const base = `${home}/.claude`
  return { base, project: `${base}/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}` }
}

async function load($: any) {
  const { project } = await paths($)
  const current = await $.session.id()
  const entries = await $.fs.list(project)
  const files = entries
    .filter((f: any) => f.kind === 'file' && f.name.endsWith('.jsonl'))
    .map((f: any) => ({ id: f.name.slice(0, -6), mtimeMs: f.mtimeMs }))
    .filter((f: any) => UUID.test(f.id) && f.id !== current)
    .sort((a: any, b: any) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_ROWS)
  const list: SessionRow[] = []
  for (const f of files) {
    const r = await $.process.run(['head', '-c', HEAD_BYTES, `${project}/${f.id}.jsonl`])
    const date = new Date(f.mtimeMs).toISOString().slice(0, 16).replace('T', ' ')
    list.push({ id: f.id, label: `${date}  ${firstPrompt(r.stdout)}` })
  }
  await update($, rows, () => list)
}

async function remove($: any, id: string) {
  if (!UUID.test(id) || id === (await $.session.id())) {
    await update($, message, () => 'Refused: invalid or current session.')
    return
  }
  const { base, project } = await paths($)
  await $.process.run([
    'rm', '-rf', '--',
    `${project}/${id}.jsonl`,
    `${project}/${id}`,
    `${base}/session-env/${id}`,
    `${base}/file-history/${id}`,
  ])
  // rmdir removes the dev-mods folder only when it is empty.
  await $.process.run(['rmdir', `${base}/dev-mods/${id}`])
  await update($, message, () => `Deleted ${id}`)
  await load($)
  await $.ui.close({ id: PANE })
  $.ui.toast(`Deleted ${id}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'session-rm',
      description: 'Pick one session of this project and delete it',
    })
    return next(e)
  })

  on('command.run', { command: 'session-rm' }, async $ => {
    await update($, message, () => '')
    await load($)
    await $.ui.open({ id: PANE, title: 'Delete a session', focus: true })
    await load($)
    return { text: 'Session list opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Select } = $.ui.resolve(e)
    const list = await read($, rows)
    const note = await read($, message)

    return (
      <Box flexDirection="column">
        {note !== '' && <Text>{note}</Text>}
        {list.length === 0 ? (
          <Text dimColor>No other sessions.</Text>
        ) : (
          <Select
            key="session"
            autoFocus
            label="Session"
            options={list.map(r => ({ value: r.id, label: r.label }))}
            onSelect={async (id: string) => {
              const row = list.find(r => r.id === id)
              const answer = await $.ui.ask(`Delete "${row?.label ?? id}"?`, ['Delete', 'Cancel'])
              if (answer === 'Delete') await remove($, id)
            }}
          />
        )}
      </Box>
    )
  })
}
