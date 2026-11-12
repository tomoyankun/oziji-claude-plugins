export type Row = {
  id: string
  date: string
  tag: string
  done: boolean
  current: boolean
  label: string
}

declare module 'claude-code' {
  interface PluginState {
    'session-tag': { rows: Shaped<Row[]>; progress: Shaped<string> }
  }
}
