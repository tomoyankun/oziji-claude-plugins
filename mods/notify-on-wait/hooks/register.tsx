import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

const label = atom({ plugin: 'notify-on-wait', key: 'label' } as const, null)
const isOn = atom({ plugin: 'notify-on-wait', key: 'isOn' } as const, false)

const FLASH_MS = 500
const PANE = 'notify-on-wait'
const WORKER_TIMEOUT_MS = 30000
let timer: Timer | undefined
let limit: Timer | undefined

type Kind = 'permission' | 'question'

async function commandsFor(
  $: EngineInterface,
  kind: Kind,
): Promise<readonly (readonly string[])[]> {
  const file = `${$.plugin.root}/sounds/${kind}.wav`
  const { stdout } = await $.process.run(['uname', '-sr'], { timeoutMs: 3000 })
  const name = stdout.trim().toLowerCase()
  if (name.startsWith('darwin')) return [['afplay', file]]
  if (name.includes('microsoft')) {
    const converted = await $.process.run(['wslpath', '-w', file], { timeoutMs: 3000 })
    const winPath = converted.stdout.trim().replaceAll("'", "''")
    return [
      [
        'powershell.exe',
        '-NoProfile',
        '-Command',
        `(New-Object System.Media.SoundPlayer '${winPath}').PlaySync()`,
      ],
    ]
  }
  if (name.startsWith('linux')) return [['paplay', file], ['aplay', '-q', file]]
  return []
}

async function play($: EngineInterface, kind: Kind): Promise<void> {
  try {
    for (const argv of await commandsFor($, kind)) {
      try {
        const ran = await $.process.run(argv, { timeoutMs: 5000 })
        if (ran.exitCode === 0) return
      } catch {
        // If the command is missing, try the next candidate.
      }
    }
  } catch {
    // If detection fails, play no sound.
  }
}

function beginWait(
  $: EngineInterface,
  kind: Kind,
  text: string,
  timeoutMs?: number,
): void {
  if (timer !== undefined) return
  void play($, kind)
  void update($, label, () => text)
  void update($, isOn, () => true)
  void $.ui.open({ id: PANE, title: 'Waiting for input' }).catch(() => undefined)
  timer = $.clock.every(FLASH_MS, () => {
    void update($, isOn, on => !on)
  })
  if (timeoutMs !== undefined) limit = $.clock.after(timeoutMs, () => stopFlash($))
}

function stopFlash($: EngineInterface): void {
  timer?.cancel()
  limit?.cancel()
  timer = undefined
  limit = undefined
  void update($, label, () => null)
  void update($, isOn, () => false)
  void $.ui.close({ id: PANE }).catch(() => undefined)
}

export const register: Register = on => {
  on('classic.Notification', ($, e, next) => {
    if (e.notification_type === 'worker_permission_prompt') {
      const kind = e.message.includes('AskUserQuestion') ? 'question' : 'permission'
      beginWait($, kind, e.message, WORKER_TIMEOUT_MS)
    } else if (e.notification_type === 'permission_prompt') {
      beginWait($, 'permission', 'A permission prompt is waiting')
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', ($, e, next) => {
    beginWait($, 'permission', 'A permission prompt is waiting')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Elicitation', ($, e, next) => {
    beginWait($, 'question', 'Claude has a question')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.ElicitationResult', ($, e, next) => {
    stopFlash($)
    return next(e)
  })

  on('classic.PostToolUse', ($, e, next) => {
    stopFlash($)
    return next(e)
  })

  on('classic.PostToolUseFailure', ($, e, next) => {
    stopFlash($)
    return next(e)
  })

  on('classic.PermissionDenied', ($, e, next) => {
    stopFlash($)
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    stopFlash($)
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    stopFlash($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const text = await read($, label)
    if (text === null) return next(e)

    const flashing = await read($, isOn)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text bold inverse={flashing} color="red">
          {' '}
          {text}{' '}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const text = await read($, label)
    const flashing = await read($, isOn)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text bold inverse={flashing} color="red">
          {' '}
          {text ?? ''}{' '}
        </Text>
      </Box>
    )
  })
}
