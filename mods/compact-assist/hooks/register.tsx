import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const percentAtom = atom({ plugin: 'compact-assist', key: 'percent' } as const, 0)
// A flag: run compact after the button's memo turn ends.
const pendingAtom = atom({ plugin: 'compact-assist', key: 'pending' } as const, false)

export const ACT_PERCENT = 70
export const COMPACT_INSTRUCTIONS = (path: string): string =>
  `Keep the decisions and the open tasks. Tell the model to read ${path} first when the session resumes.`
export const MEMO_PATH = '~/.claude/compact-memo.md'

export const noticeOf = (percent: number): string | undefined =>
  percent >= ACT_PERCENT ? `context ${percent}%:` : undefined

export const memoPrompt = (path: string): string => `Write the content of this session to the file ${path}. Use the Write tool and give the absolute path. Overwrite the file if it exists. Use these four headings, with bullet points under each.

## Decisions
What was decided, and why.

## Open tasks
Work that is not finished.

## Next action
The one action to take next.

## Failed approaches
Approaches that were tried and failed, and why they failed.

Do not write what the code or the git history already shows. When done, report only the file path.`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'compact-memo',
      description: `Writes decisions and open tasks to ${MEMO_PATH}. Run it before /compact`,
    })
    const usage = await $.session.usage()
    await update($, percentAtom, () => usage.context.percent ?? 0)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, percentAtom, () => e.context.percent ?? 0)

    return next(e)
  })

  on('command.run', { command: 'compact-memo' }, async $ => {
    const home = await $.env.get('HOME')

    // Passed as a hidden message. The model reads it at the start of the next turn.
    return {
      text: `Ready to write the memo to ${MEMO_PATH}. Send any message, and the model starts writing. When it finishes, run /compact.`,
      context: [memoPrompt(`${home}/.claude/compact-memo.md`)],
    }
  })

  // When the memo turn started by the button ends, check that the memo exists, then run compact.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId !== undefined || !(await read($, pendingAtom))) {
      return result
    }

    await update($, pendingAtom, () => false)

    if (e.reason !== 'answer') {
      return result
    }

    const home = await $.env.get('HOME')
    const path = `${home}/.claude/compact-memo.md`
    const hasMemo = await $.fs.read(path).then(text => text.trim().length > 0).catch(() => false)

    if (!hasMemo) {
      void $.ui.toast('compact-memo: The memo was not written, so compact was cancelled')

      return result
    }

    // Run after the turn has fully ended. compact is refused while a turn is running.
    $.clock.after(500, () =>
      $.session
        .compact({ instructions: COMPACT_INSTRUCTIONS(path) })
        .then(() => $.ui.toast('compact-memo: compact finished'))
        .catch(error => $.ui.toast(`compact-memo: compact failed: ${String(error)}`)),
    )

    return result
  })

  // Add one compact cue line below the mode line (PromptHint).
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const notice = noticeOf(await read($, percentAtom))
    const original = await next(e)

    if (notice === undefined) {
      return original
    }

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {original}
        <Box key="notice">
          <Text color="error">{notice} </Text>
          <Button
            key="memo"
            label="Save a memo and run /compact"
            onPress={() => {
              void update($, pendingAtom, () => true)
              void $.env
                .get('HOME')
                .then(home => $.prompt.submit({ text: memoPrompt(`${home}/.claude/compact-memo.md`), asUser: true }))
                .catch(error => $.ui.toast(`compact-memo: send failed: ${String(error)}`))
            }}
          />
        </Box>
      </Box>
    )
  })
}
