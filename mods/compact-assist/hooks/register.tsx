import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const percentAtom = atom({ plugin: 'compact-assist', key: 'percent' } as const, 0)
// ボタンでメモを書かせた後に、compact を実行するための印。
const pendingAtom = atom({ plugin: 'compact-assist', key: 'pending' } as const, false)

export const ACT_PERCENT = 70
export const COMPACT_INSTRUCTIONS = (path: string): string =>
  `決定事項と未完了のタスクを残す。再開するときは、まず ${path} を読むよう書く。`
export const MEMO_PATH = '~/.claude/compact-memo.md'

export const noticeOf = (percent: number): string | undefined =>
  percent >= ACT_PERCENT ? `context ${percent}%: メモを残して /compact を実行` : undefined

export const memoPrompt = (path: string): string => `このセッションの内容を、ファイル ${path} に書き出してください。Write ツールを使い、絶対パスで指定してください。既存のファイルは上書きしてください。次の4つの見出しで、箇条書きにしてください。

## 決定事項
決まったことと、その理由。

## 未完了のタスク
まだ終わっていない作業。

## 次の操作
次にやる1つの操作。

## 失敗した方法
試して失敗した方法と、失敗の原因。

コードや git の履歴から分かる内容は、書かないでください。書き終えたら、ファイルのパスだけを報告してください。`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'compact-memo',
      description: `決定事項と未完了タスクを ${MEMO_PATH} に書き出す。/compact の前に実行する`,
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

    // 隠しメッセージとして渡す。モデルは、次のターンの冒頭で読む。
    return {
      text: `メモを ${MEMO_PATH} に書き出します。「書いて」と送信すると、モデルが書き始めます。書き終えたら /compact を実行してください。`,
      context: [memoPrompt(`${home}/.claude/compact-memo.md`)],
    }
  })

  // ボタンで始めたメモのターンが終わったら、メモの存在を確認して、compact を実行する。
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
      void $.ui.toast('compact-memo: メモが書かれていないため、compact を中止しました')

      return result
    }

    // ターンが完全に終わってから実行する。実行中のターンがあると、compact は拒否される。
    $.clock.after(500, () =>
      $.session
        .compact({ instructions: COMPACT_INSTRUCTIONS(path) })
        .catch(error => $.ui.toast(`compact-memo: compact に失敗しました: ${String(error)}`)),
    )

    return result
  })

  // モード行(PromptHint)の下に、compact の合図を1行足す。
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
            label="メモを書いて compact"
            onPress={() => {
              void update($, pendingAtom, () => true)
              void $.env
                .get('HOME')
                .then(home => $.prompt.submit({ text: memoPrompt(`${home}/.claude/compact-memo.md`), asUser: true }))
                .catch(error => $.ui.toast(`compact-memo: 送信に失敗しました: ${String(error)}`))
            }}
          />
        </Box>
      </Box>
    )
  })
}
