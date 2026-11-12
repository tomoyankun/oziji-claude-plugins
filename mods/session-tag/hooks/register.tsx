import type { Register } from 'claude-code'

import { cleanTag, firstPrompt, pickTargets } from './tags'
import type { Entry, SessionFile } from './tags'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HEAD_BYTES = '65536'
const MAX_TAGGED = 20

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

// Tags the newest untagged sessions, one at a time. A failed session stays untagged.
export async function tagMissing($: any, onProgress: (done: number, total: number) => void): Promise<void> {
  const project = await projectDir($)
  const files = await loadFiles($)
  const entries = await readEntries($)
  const targets = pickTargets(files, entries, await $.session.id(), MAX_TAGGED)
  let done = 0
  for (const id of targets) {
    try {
      const head = (await $.process.run(['head', '-c', HEAD_BYTES, `${project}/${id}.jsonl`])).stdout
      const text = firstPrompt(head)
      const tag = text === undefined ? undefined : await generateTag($, text)
      if (tag !== undefined) {
        const current = (await $.store.get(id)) as Entry | undefined
        await $.store.set(id, { tag, done: current?.done ?? false })
      }
    } catch {
      // One failed session must not stop the others.
    }
    done += 1
    onProgress(done, targets.length)
  }
}

export const register: Register = () => {}
