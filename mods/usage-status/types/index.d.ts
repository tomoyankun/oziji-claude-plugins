export type Segment = { text: string; percent: number; label?: string; value?: string; reset?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-status': { segments: Segment[]; isTeammate: boolean; enabled: boolean }
  }
}
