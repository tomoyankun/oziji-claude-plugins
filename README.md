# oziji-claude-plugins

English | [日本語](./README.ja.md)

A collection of Claude Code mods (plugins). A mod changes the interface or behavior of Claude Code itself, such as a status display or a slash command.

This repository is a Claude Code marketplace. Install a mod with `/plugin install`.

## Mods

| Mod | Description |
| --- | --- |
| [`usage-status`](./mods/usage-status/README.md) | Always shows the 5-hour and 1-week usage limits and the session token usage as gauges below the mode line. A gauge turns yellow at 50% and red at 80%. |
| [`compact-assist`](./mods/compact-assist/README.md) | Shows a cue and a button when context usage reaches 70%. The button writes a memo, then runs compact. |
| [`notify-on-wait`](./mods/notify-on-wait/README.md) | Plays a 0.3-second sound when a permission prompt or a question from the model appears. Blinks the band above the prompt and a pane until you answer. |

## Install

Prerequisite: Claude Code is installed and the `claude` command works.

Enter this command at the Claude Code prompt:

```
/plugin install usage-status --marketplace tomoyankun/oziji-claude-plugins
```

1. The first time, Claude Code shows `Add marketplace?`. Select `y`.
2. Select a scope.
   - **user**: The mod is active in every session, in any repository.
   - **project**: Claude Code records the setting in `.claude/settings.json` of the target repository. Use this to share the mod with a team.
3. After the install, the mod is active in the same session.

To install from a source other than GitHub, give a git URL or a local folder path in place of `tomoyankun/oziji-claude-plugins`.

### Share with a team

Write this in `.claude/settings.json` of the target repository. Every member who opens and trusts the repository is prompted to add the marketplace and enable the mod.

```json
{
  "extraKnownMarketplaces": {
    "oziji-claude-plugins": {
      "source": { "source": "github", "repo": "tomoyankun/oziji-claude-plugins" }
    }
  },
  "enabledPlugins": {
    "usage-status@oziji-claude-plugins": true
  }
}
```

### Update

1. Run `claude plugin marketplace update oziji-claude-plugins`.
2. Run `claude plugin update usage-status@oziji-claude-plugins`.
3. Run `/reload-plugins`.

## License

[MIT License](./LICENSE).
