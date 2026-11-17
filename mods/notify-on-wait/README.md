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

The mod runs these commands. It runs no other command.

1. `uname -sr` detects the OS.
2. On WSL, `wslpath -w <WAV path>` converts the WAV path to a Windows path.
3. On WSL, `powershell.exe -NoProfile -Command "(New-Object System.Media.SoundPlayer '<Windows path>').PlaySync()"` plays the WAV. The mod doubles each `'` in the path.
4. On mac, `afplay <WAV path>` plays the WAV.
5. On Linux, `paplay <WAV path>` plays the WAV. If it fails, `aplay -q <WAV path>` plays the WAV.

Every command has a timeout (3 seconds for `uname` and `wslpath`, 5 seconds for playback). The mod plays only the WAV files in its own `sounds/` folder. It does not read or send any other data.

On an OS that is not mac, Linux, or WSL, the mod runs no playback command and no sound plays. When the detection or the playback fails, the mod plays no sound and shows no error.

## Limitations

- The mod was tested only on WSL (tmux and the VS Code terminal). It is untested on mac and Linux.
- The pane opens only when the terminal is 110 columns wide or more. When a tmux split is too narrow, only the sound plays.
- While a question dialog is shown, the band above the prompt is hidden.
- The mod cannot detect the answer to a teammate's wait. The blink stops after 30 seconds.
- In an environment without a playback command, no sound plays.
