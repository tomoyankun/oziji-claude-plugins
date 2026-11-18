import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { SessionRow } from '../types'

const PANE = 'session-rm'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HEAD_BYTES = '65536'
const PANE_ARGS = {
  id: PANE,
  title: 'Delete a session',
  focus: true,
  closeOnEscape: true,
} as const
const MAX_ROWS = 100
const PAGE_SIZE = 8

const rows = atom({ plugin: 'session-rm', key: 'rows' } as const, [], {
  shape: 'rows-1',
})
const page = atom({ plugin: 'session-rm', key: 'page' } as const, 0, {
  shape: 'page-1',
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
  const base = `${home}/.claude`
  const current = await $.session.id()
  // The transcript of the current session names the project folder. The
  // working directory can differ from it after /cd or a worktree move.
  const found = await $.process.run([
    'find', `${base}/projects`, '-maxdepth', '2', '-name', `${current}.jsonl`,
  ])
  const hits = found.stdout.split('\n').filter((l: string) => l.endsWith('.jsonl'))
  const root = await $.session.root()
  const fromRoot = `${base}/projects/${root.replace(/[^a-zA-Z0-9]/g, '-')}`
  // The same id can exist in two project folders (resume, fork): prefer the root's.
  const hit = hits.find((l: string) => l === `${fromRoot}/${current}.jsonl`) ?? hits[0]
  if (hit) return { base, project: hit.slice(0, hit.lastIndexOf('/')) }
  return { base, project: fromRoot }
}

async function load($: any, known?: { project: string }) {
  const { project } = known ?? (await paths($))
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
  const resolved = await paths($)
  const { base, project } = resolved
  const removed = await $.process.run([
    'rm', '-rf', '--',
    `${project}/${id}.jsonl`,
    `${project}/${id}`,
    `${base}/session-env/${id}`,
    `${base}/file-history/${id}`,
  ])
  if (removed.exitCode !== 0) {
    const reason = removed.stderr.trim() || `exit code ${removed.exitCode}`
    await update($, message, () => `Delete failed: ${reason}`)
    $.ui.toast(`Delete failed: ${reason}`)
    await load($, resolved)
    return
  }
  await $.process.run(['rmdir', `${base}/dev-mods/${id}`])
  await update($, message, () => `Deleted ${id}`)
  await load($, resolved)
  await $.ui.close({ id: PANE })
  $.ui.toast(`Deleted ${id}`)
}

// Shows the page one step away, then puts the focus ring on the button that
// moves in the same direction. The reached page may not draw that button
// (first or last page). Then the ring goes to the opposite button. Without it,
// the pressed button can leave the ring and the keys return to the main session.
async function turn($: any, pages: number, step: 1 | -1) {
  let reached: number
  try {
    // The updater clamps the page. Two fast presses then move two pages, not one.
    await update($, page, (p: number) => Math.min(Math.max(p + step, 0), pages - 1))
    reached = await read($, page)
  } catch (err) {
    $.ui.toast(`Page change failed: ${String(err)}`)
    return
  }
  const same = step === 1 ? 'next' : 'prev'
  const other = step === 1 ? 'prev' : 'next'
  const hasSame = step === 1 ? reached < pages - 1 : reached > 0
  try {
    const moved = await $.ui.focus({ requestId: PANE, key: hasSame ? same : other })
    if ('deny' in moved) $.ui.toast(`Focus not restored: ${moved.deny}`)
  } catch (err) {
    $.ui.toast(`Focus not restored: ${String(err)}`)
  }
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
    await update($, page, () => 0)
    try {
      await load($)
    } catch (err) {
      await update($, rows, () => [])
      await update($, message, () => `Could not read sessions: ${String(err)}`)
    }
    const opened = await $.ui.open(PANE_ARGS)
    if (!opened.isPlaced) return { text: `Session list not shown: ${opened.reason}` }
    return { text: 'Session list opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, rows)
    const note = await read($, message)
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
    const current = Math.min(await read($, page), pages - 1)
    const shown = list.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

    return (
      <Box flexDirection="column">
        <Text bold>{`Select a session to delete. (${current + 1}/${pages})`}</Text>
        {note !== '' && <Text>{note}</Text>}
        {list.length === 0 ? (
          <Text dimColor>No other sessions.</Text>
        ) : (
          <Box flexDirection="column">
            {shown.map((r, i) => (
              <Button
                key={r.id}
                plain
                autoFocus={i === 0 ? true : undefined}
                label={r.label}
                onPress={async () => {
                  const answer = await $.ui.ask(`Delete "${r.label}"?`, ['Delete', 'Cancel'])
                  if (answer === 'Delete') await remove($, r.id)
                  else if ((await $.ui.panes()).some((x: any) => x.id === PANE)) {
                    // The dialog took the keys. Take them back, then move the ring.
                    // A pane the person closed meanwhile stays closed.
                    await $.ui.open(PANE_ARGS)
                    const moved = await $.ui.focus({ requestId: PANE, key: r.id })
                    if ('deny' in moved) $.ui.toast(`Focus not restored: ${moved.deny}`)
                  }
                }}
              />
            ))}
            {current > 0 && (
              <Button
                key="prev"
                plain
                label={`< Previous page (${current}/${pages})`}
                onPress={() => turn($, pages, -1)}
              />
            )}
            {current < pages - 1 && (
              <Button
                key="next"
                plain
                label={`> Next page (${current + 2}/${pages})`}
                onPress={() => turn($, pages, 1)}
              />
            )}
          </Box>
        )}
      </Box>
    )
  })
}
