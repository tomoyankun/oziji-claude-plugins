# session-tag

English | [日本語](./README.ja.md)

Tags the sessions of the current project, so you can tell what each session was for and which ones are done. Claude writes a short content tag for each session. You mark a session done by hand.

## Install

```
/plugin install session-tag --marketplace tomoyankun/oziji-claude-plugins
```

See the [root README](../../README.md#install) for the scope options, team sharing, and update steps.

## Usage

1. Enter `/session-tag`. A pane opens with the sessions of the current project, newest first (up to 100). Each row shows the update time, a done mark, the content tag, and the first 40 characters of the first prompt.
2. Claude tags the newest untagged sessions in the background, up to 20 per run. The pane shows `Tagging n/m` while it works. A session that fails stays untagged and is tried again the next time you open the pane.
3. Select a row with the up and down arrow keys, then press Enter. This marks the session `[done]`. Press Enter on the same row again to remove the mark.

The current session shows `(current)` and cannot be marked.

## Where the tags are kept

The tags are kept in the mod's own store, with the session ID as the key. The mod never changes the session files. When you open the pane, the mod removes the tags of sessions whose files no longer exist.

Each tagging call sends the first prompt of a session (up to 200 characters) to the `haiku` model.

This mod does not delete sessions. Use `session-rm` for that.
