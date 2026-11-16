export type SessionRow = { id: string; label: string }

declare module 'claude-code' {
  interface PluginState {
    'session-rm': { rows: Shaped<SessionRow[]>; message: Shaped<string>; page: Shaped<number> }
  }
}
