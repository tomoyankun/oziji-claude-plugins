export type Entry = { tag: string; done: boolean }
export type SessionFile = { id: string; mtimeMs: number }

const MAX_TAG = 20
const MAX_PROMPT = 200

// The first typed prompt in the head of a transcript, cut to 200 characters.
export function firstPrompt(head: string): string | undefined {
  for (const line of head.split('\n')) {
    try {
      const row = JSON.parse(line)
      if (row.type !== 'user' || row.isSidechain) continue
      const c = row.message?.content
      const text = typeof c === 'string' ? c : c?.find?.((b: any) => b.type === 'text')?.text
      if (typeof text !== 'string' || text.startsWith('<')) continue
      return text.replace(/\s+/g, ' ').trim().slice(0, MAX_PROMPT)
    } catch {
      // A truncated or non-JSON line: skip it.
    }
  }
  return undefined
}

// The newest ids without a stored tag (a done mark alone does not count), at most `limit`. The current session is left out.
export function pickTargets(
  files: SessionFile[],
  entries: Map<string, Entry>,
  current: string,
  limit: number,
): string[] {
  return [...files]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map(f => f.id)
    .filter(id => id !== current && !entries.get(id)?.tag)
    .slice(0, limit)
}

// A timestamp as local time: YYYY-MM-DD HH:MM.
export function dateOf(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function cleanTag(text: string): string {
  return Array.from(text.replace(/["`]/g, '').replace(/\s+/g, ' ').trim()).slice(0, MAX_TAG).join('')
}

// Stored ids that have no session file any more.
export function staleIds(keys: string[], existing: string[]): string[] {
  const have = new Set(existing)
  return keys.filter(k => !have.has(k))
}
