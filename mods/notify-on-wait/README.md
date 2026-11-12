# notify-on-wait

English | [日本語](./README.ja.md)

Tells you when Claude Code waits for your action. The mod plays a sound and blinks a band above the prompt until you answer.

## Install

```
/plugin install notify-on-wait --marketplace tomoyankun/oziji-claude-plugins
```

See the [root README](../../README.md#install) for the scope options, team sharing, and update steps.

## Behavior

- Targets: A permission prompt, a question from the model, and a permission prompt or question from a teammate.
- Sound: Plays the bundled WAV (0.3 seconds) once. A permission prompt uses 880 Hz. A question uses 660 Hz.
- Blink: The band above the prompt and the "Waiting for input" pane on the right blink until you answer.
- The mod does not stack sounds for the same wait.

## Sound playback

| OS | Command |
| --- | --- |
| mac | `afplay` |
| Linux | `paplay`. If it fails, `aplay` |
| WSL | `System.Media.SoundPlayer` through `powershell.exe` |

## Limitations

- The mod was tested only on WSL (tmux and the VS Code terminal). It is untested on mac and Linux.
- The pane opens only when the terminal is 110 columns wide or more. When a tmux split is too narrow, only the sound plays.
- While a question dialog is shown, the band above the prompt is hidden.
- The mod cannot detect the answer to a teammate's wait. The blink stops after 30 seconds.
- In an environment without a playback command, no sound plays.
