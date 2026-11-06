import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Segment } from '../types'

const segmentsAtom = atom({ plugin: 'usage-status', key: 'segments' } as const, [] as Segment[])

// 別ペインのチームメイトは、チーム設定のtmuxPaneIdに自分のTMUX_PANEが載る。リードは載らない。
const teammateAtom = atom({ plugin: 'usage-status', key: 'isTeammate' } as const, false)

// 表示のオン・オフ。再起動後も保つため、ファイルに保存する。
const enabledAtom = atom({ plugin: 'usage-status', key: 'enabled' } as const, true)
const SETTINGS_FILE = '.claude/usage-status.json'
// デスクトップアプリでは、モード行の下に加えて、ペインにもゲージを出す。
const PANE = 'usage-status'
const PANE_TITLE = 'Status'

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }
const GAUGE_WIDTH = 10
export const CAUTION_PERCENT = 50
export const DANGER_PERCENT = 80

export type Level = 'ok' | 'caution' | 'danger'

const LEVEL_COLORS = { ok: 'success', caution: 'warning', danger: 'error' } as const

export const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}k` : `${n}`

export const gauge = (percent: number): string => {
  const filled = Math.min(GAUGE_WIDTH, Math.max(0, Math.round((percent / 100) * GAUGE_WIDTH)))

  return '█'.repeat(filled) + '░'.repeat(GAUGE_WIDTH - filled)
}

export const levelOf = (segment: Segment): Level =>
  segment.percent >= DANGER_PERCENT ? 'danger' : segment.percent >= CAUTION_PERCENT ? 'caution' : 'ok'

// サブエージェント・チームメイトのtranscriptを開いている間は、ゲージを出さない。
// props.view が無いエンジンでは、メイン会話として扱う。
// PromptHint の props には hasSurvey も view も無い(型定義)。無い項目は false として扱う。
type ViewProps = { hasSurvey?: boolean; view?: { agentId?: string } }

export const isHiddenView = (props: ViewProps): boolean =>
  props.hasSurvey === true || props.view?.agentId !== undefined

type TeamConfig = { members?: { backendType?: string; tmuxPaneId?: string }[] }

export const isTeammatePane = (configs: TeamConfig[], pane: string | undefined): boolean =>
  pane !== undefined &&
  configs.some(c => c.members?.some(m => m.backendType === 'tmux' && m.tmuxPaneId === pane))

const readTeamConfigs = async ($: EngineInterface): Promise<TeamConfig[]> => {
  const home = await $.env.get('HOME')
  const dirs = await $.fs.list(`${home}/.claude/teams`)
  const configs: TeamConfig[] = []

  for (const d of dirs) {
    try {
      configs.push(JSON.parse(await $.fs.read(`${home}/.claude/teams/${d.name}/config.json`)))
    } catch {
      // 設定が読めないチームは判定に使わない。
    }
  }

  return configs
}

// 引数なしは反転、on / off は指定どおり。それ以外は undefined を返す。
export const parseToggle = (args: string, current: boolean): boolean | undefined => {
  const word = args.trim().toLowerCase()

  return word === '' ? !current : word === 'on' ? true : word === 'off' ? false : undefined
}

// pane: true は常に開く。false は開かない。未設定はデスクトップアプリのときだけ開く。
type Settings = { enabled: boolean; pane: boolean | undefined }

const readSettings = async ($: EngineInterface): Promise<Settings> => {
  try {
    const home = await $.env.get('HOME')
    const saved = JSON.parse(await $.fs.read(`${home}/${SETTINGS_FILE}`))

    return { enabled: saved.enabled !== false, pane: typeof saved.pane === 'boolean' ? saved.pane : undefined }
  } catch {
    // ファイルが無い、または読めないときは、ゲージを表示し、ペインは未設定にする。
    return { enabled: true, pane: undefined }
  }
}

const writeSettings = async ($: EngineInterface, patch: Partial<Settings>): Promise<void> => {
  const home = await $.env.get('HOME')
  const current = await readSettings($)

  await $.fs.write(`${home}/${SETTINGS_FILE}`, JSON.stringify({ ...current, ...patch }))
}

const hasDesktop = async ($: EngineInterface): Promise<boolean> =>
  $.session
    .surfaces()
    .then(list => list.includes('desktop'))
    .catch(() => false)

const shouldOpenPane = async ($: EngineInterface, settings: Settings): Promise<boolean> =>
  settings.pane ?? (await hasDesktop($))

const BAR_COLORS = { ok: '#2e9e5b', caution: '#d4a017', danger: '#d64545' } as const
const BAR_WIDTH = 200

// デスクトップのペイン用。割合に応じて塗る棒を、SVGで描く。
export const barSvg = (percent: number, level: Level): string => {
  const w = Math.round((Math.min(100, Math.max(0, percent)) / 100) * BAR_WIDTH)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR_WIDTH}" height="10" viewBox="0 0 ${BAR_WIDTH} 10">` +
    `<rect width="${BAR_WIDTH}" height="10" rx="5" fill="#888" fill-opacity="0.25"/>` +
    (w > 0 ? `<rect width="${w}" height="10" rx="5" fill="${BAR_COLORS[level]}"/>` : '') +
    `</svg>`
  )
}

const pad = (n: number): string => String(n).padStart(2, '0')

// 5時間枠は当日中にリセットされるため時刻のみ、1週間枠は日付も示す。
export const formatReset = (kind: string, resetsAt: string | undefined): string => {
  const date = resetsAt === undefined ? undefined : new Date(resetsAt)

  if (date === undefined || Number.isNaN(date.getTime())) {
    return ''
  }

  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  return kind === 'five_hour' ? ` ↻ ${time}` : ` ↻ ${date.getMonth() + 1}/${date.getDate()} ${time}`
}

export const buildSegments = (
  context: SessionContextUsage,
  rateLimits: SessionRateLimit[],
): Segment[] => {
  const limits = rateLimits
    .filter(r => r.kind in LABELS)
    .map(r => ({
      text: `${LABELS[r.kind]} ${gauge(r.percentUsed)} ${r.percentUsed}%${formatReset(r.kind, r.resetsAt)}`,
      percent: r.percentUsed,
      label: LABELS[r.kind],
      value: `${r.percentUsed}%`,
      reset: formatReset(r.kind, r.resetsAt).replace(' ↻ ', ''),
    }))
  // 最初の応答が返るまでtokensは無いので、0として空のゲージを出す。
  const used = context.tokens ?? 0
  const percent = context.percent ?? 0
  const tokens: Segment = {
    text: `context ${gauge(percent)} ${formatTokens(used)}/${formatTokens(context.window)} (${percent}%)`,
    percent,
    label: 'context',
    value: `${formatTokens(used)}/${formatTokens(context.window)} (${percent}%)`,
    reset: '',
  }

  return [...limits, tokens]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-status',
      description: '使用量ゲージの表示をオン・オフする(引数: on / off / pane / pane off。省略すると反転)',
    })
    const settings = await readSettings($)
    const enabledFromFile = settings.enabled
    const pane = await $.env.get('TMUX_PANE')
    const detected = await readTeamConfigs($).then(c => isTeammatePane(c, pane)).catch(() => false)
    await update($, teammateAtom, () => detected)
    await update($, enabledAtom, () => enabledFromFile)
    const usage = await $.session.usage()
    await update($, segmentsAtom, () => buildSegments(usage.context, usage.rateLimits))

    if (!detected && (await shouldOpenPane($, settings))) {
      void $.ui.open({ id: PANE, title: PANE_TITLE })
    }

    return next(e)
  })

  // デスクトップアプリは session.start の後に接続することがある。接続した時点でも開く。
  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    const settings = await readSettings($)
    const isTeammate = await read($, teammateAtom)

    if (!isTeammate && settings.pane !== false) {
      void $.ui.open({ id: PANE, title: PANE_TITLE })
    }

    return next(e)
  })

  on('command.run', { command: 'usage-status' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/)

    if (words[0] === 'pane') {
      if (words[1] === 'off') {
        await $.ui.close({ id: PANE })
        await writeSettings($, { pane: false }).catch(() => undefined)

        return { text: '使用量ペインを閉じました。次回から開きません。デスクトップアプリでも開きません。' }
      }

      const opened = await $.ui.open({ id: PANE, title: PANE_TITLE })
      await writeSettings($, { pane: true }).catch(() => undefined)

      return {
        text: opened.isPlaced
          ? '使用量ペインを開きました。次回から常に開きます。'
          : '使用量ペインを登録しました。表示できる幅になると開きます。',
      }
    }

    const current = await read($, enabledAtom)
    const next = parseToggle(e.args, current)

    if (next === undefined) {
      return { text: `引数は on、off、pane、pane off のどれかを指定してください。現在: ${current ? 'on' : 'off'}` }
    }

    await update($, enabledAtom, () => next)
    await writeSettings($, { enabled: next }).catch(() => undefined)

    return { text: `使用量ゲージを ${next ? 'on' : 'off'} にしました。` }
  })

  on('session.measure', async ($, e, next) => {
    await update($, segmentsAtom, () => buildSegments(e.context, e.rateLimits))

    return next(e)
  })

  // モード行(PromptHint)の下にゲージを足す。engineの行は next(e) でそのまま残す。
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const stored = await read($, segmentsAtom)
    const isTeammate = await read($, teammateAtom)
    const enabled = await read($, enabledAtom)

    if (!enabled || isTeammate || isHiddenView(e.props as ViewProps)) {
      return next(e)
    }

    // resumeで別セッションに切り替わると、atomが空のまま残る。空のときは使用量を直接取得する。
    const segments =
      stored.length > 0
        ? stored
        : await $.session
            .usage()
            .then(u => buildSegments(u.context, u.rateLimits))
            .catch(() => [] as Segment[])

    const original = await next(e)

    if (segments.length === 0) {
      return original
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {original}
        <Box key="gauges">
          {segments.map((s, i) => (
            <Text key={`s${i}`} color={LEVEL_COLORS[levelOf(s)]}>
              {i > 0 ? ' | ' : ''}
              {s.text}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })

  // ペインに、同じゲージを縦に並べる。
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const stored = await read($, segmentsAtom)
    const enabled = await read($, enabledAtom)
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui

    if (!enabled) {
      return <Text dimColor>Gauges are off. Run /usage-status to turn them on.</Text>
    }

    const segments =
      stored.length > 0
        ? stored
        : await $.session
            .usage()
            .then(u => buildSegments(u.context, u.rateLimits))
            .catch(() => [] as Segment[])

    return (
      <Box flexDirection="column">
        <Text dimColor>Usage</Text>
        {segments.length === 0 && <Text dimColor>No usage data yet.</Text>}
        {segments.map((s, i) =>
          'Svg' in ui && s.label !== undefined ? (
            <Box key={`p${i}`} flexDirection="column" marginBottom={1}>
              <Box justifyContent="space-between">
                <Text bold>{s.label}</Text>
                <Text color={LEVEL_COLORS[levelOf(s)]}>{s.value}</Text>
              </Box>
              <ui.Svg source={barSvg(s.percent, levelOf(s))} alt={`${s.label} ${s.value}`} width={BAR_WIDTH} />
              {s.reset && <Text dimColor>Resets {s.reset}</Text>}
            </Box>
          ) : (
            <Text key={`p${i}`} color={LEVEL_COLORS[levelOf(s)]}>
              {s.text}
            </Text>
          ),
        )}
      </Box>
    )
  })
}
