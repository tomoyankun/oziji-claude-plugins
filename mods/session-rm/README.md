# session-rm

English | [日本語](./README.ja.md)

Deletes one session of the current project. Claude Code has no command that deletes a single session. This mod lists the sessions in a pane, and you pick one.

## Install

```
/plugin install session-rm --marketplace tomoyankun/oziji-claude-plugins
```

See the [root README](../../README.md#install) for the scope options, team sharing, and update steps.

## Usage

1. Enter `/session-rm`. A pane opens with the sessions of the current project, newest first (up to 100, 8 per page; select "Previous page" or "Next page" at the end of the list). Each row shows the update time and the first 40 characters of the first prompt.
2. Select a row with the up and down arrow keys, then press Enter.
3. Select `Delete` in the confirmation. Select `Cancel` to keep the session.
4. After a deletion, the pane closes and a toast shows the deleted session ID.

## What it deletes

For the selected session ID, the mod deletes these paths under `~/.claude`:

- `projects/<project>/<ID>.jsonl` and `projects/<project>/<ID>/`
- `session-env/<ID>`
- `file-history/<ID>`
- `dev-mods/<ID>`, only when it is empty

Deletion cannot be undone. The mod does not list the current session and refuses to delete it.
