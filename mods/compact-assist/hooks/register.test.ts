import { expect, test } from 'claude-code/testing'

import { noticeOf } from './register'

test('shows no notice under 70%', () => {
  expect(noticeOf(69)).toBeUndefined()
})

test('asks for a memo and /compact from 70%', () => {
  expect(noticeOf(70)).toBe('context 70%:')
})
