import { expect, test } from 'claude-code/testing'

import { cleanTag, dateOf, firstPrompt, pickTargets, staleIds } from './tags'
import type { Entry, SessionFile } from './tags'

const user = (text: string) => JSON.stringify({ type: 'user', message: { content: text } })

test('firstPrompt skips lines starting with < and returns the first typed prompt', () => {
  const head = [user('<command-name>x</command-name>'), user('fix the bug')].join('\n')
  expect(firstPrompt(head)).toBe('fix the bug')
})

test('firstPrompt returns undefined when no prompt exists', () => {
  expect(firstPrompt(JSON.stringify({ type: 'assistant' }))).toBeUndefined()
})

test('firstPrompt ignores a truncated last line', () => {
  const head = [user('hello'), '{"type":"user","message":{"cont'].join('\n')
  expect(firstPrompt(head)).toBe('hello')
  expect(firstPrompt('{"type":"user","message":{"cont')).toBeUndefined()
})

test('pickTargets returns the newest untagged ids up to the limit, excluding the current session', () => {
  const files: SessionFile[] = Array.from({ length: 25 }, (_, i) => ({ id: `s${i}`, mtimeMs: i }))
  const entries = new Map<string, Entry>([
    ['s24', { tag: 't', done: false }],
    ['s23', { tag: 't', done: true }],
    ['s10', { tag: 't', done: false }],
  ])
  const ids = pickTargets(files, entries, 's22', 20)
  expect(ids).toHaveLength(20)
  expect(ids[0]).toBe('s21')
  expect(ids).not.toContain('s22')
  expect(ids).not.toContain('s24')
  expect(ids).not.toContain('s10')
})

test('pickTargets treats an entry with an empty tag as untagged', () => {
  const files: SessionFile[] = [{ id: 'a', mtimeMs: 1 }]
  const entries = new Map<string, Entry>([['a', { tag: '', done: true }]])
  expect(pickTargets(files, entries, 'x', 20)).toEqual(['a'])
})

test('cleanTag cuts to 20 characters and removes newlines and quotes', () => {
  expect(cleanTag('"Add\nsession  tag"')).toBe('Add session tag')
  expect(cleanTag('a'.repeat(30))).toBe('a'.repeat(20))
})

test('staleIds returns stored ids without a file', () => {
  expect(staleIds(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b'])
})

test('dateOf formats local time', () => {
  expect(dateOf(new Date(2026, 0, 2, 3, 4).getTime())).toBe('2026-01-02 03:04')
})

test('cleanTag keeps apostrophes and does not split a surrogate pair', () => {
  expect(cleanTag("Don't crash")).toBe("Don't crash")
  expect(cleanTag('a'.repeat(19) + '😀😀')).toBe('a'.repeat(19) + '😀')
})
