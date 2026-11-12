# compact-assist

English | [日本語](./README.ja.md)

Shows a compact cue below the mode line when context usage reaches 70%. As context grows, the accuracy of the AI can drop. This mod tells you when to summarize (`/compact`).

## Install

```
/plugin install compact-assist --marketplace tomoyankun/oziji-claude-plugins
```

See the [root README](../../README.md#install) for the scope options, team sharing, and update steps.

## Behavior

- Usage of 70% or more: Shows a red "context N%:" and a button, "メモを残して /compact を実行" (save a memo and run /compact).
- Button: Makes the model write `~/.claude/compact-memo.md`. Right after the turn that writes the memo, the mod runs `/compact` automatically. The summary instruction includes a sentence that tells the model to read the memo again.

## Commands

| Command | Action |
| --- | --- |
| `/compact-memo` | Makes the model write the memo. Does not run compact. |

The memo holds decisions, unfinished tasks, the next action, and methods that failed. An existing file is overwritten.
