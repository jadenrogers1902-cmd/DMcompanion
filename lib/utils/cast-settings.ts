export type CastLayoutMode = 'auto_grid' | 'main_side_rail' | 'rotating_focus'
export type CastMainFocus = 'party_leader' | 'first_player' | 'manual'
export type CastViewZoom = 'close' | 'balanced' | 'wide'

export interface CenterCastSettings {
  dynamicSplitEnabled: boolean
  splitDistanceFeet: number
  layoutMode: CastLayoutMode
  mainFocus: CastMainFocus
  viewZoom: CastViewZoom
  showPlayerNames: boolean
  showHealthBars: boolean
  showTokenHints: boolean
  showFog: boolean
  hideChromeByDefault: boolean
}

export const DEFAULT_CENTER_CAST_SETTINGS: CenterCastSettings = {
  dynamicSplitEnabled: true,
  splitDistanceFeet: 120,
  layoutMode: 'auto_grid',
  mainFocus: 'party_leader',
  viewZoom: 'balanced',
  showPlayerNames: true,
  showHealthBars: true,
  showTokenHints: true,
  showFog: true,
  hideChromeByDefault: false,
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

function asLayoutMode(value: unknown): CastLayoutMode {
  return value === 'main_side_rail' || value === 'rotating_focus' || value === 'auto_grid'
    ? value
    : DEFAULT_CENTER_CAST_SETTINGS.layoutMode
}

function asMainFocus(value: unknown): CastMainFocus {
  return value === 'first_player' || value === 'manual' || value === 'party_leader'
    ? value
    : DEFAULT_CENTER_CAST_SETTINGS.mainFocus
}

function asViewZoom(value: unknown): CastViewZoom {
  return value === 'close' || value === 'wide' || value === 'balanced'
    ? value
    : DEFAULT_CENTER_CAST_SETTINGS.viewZoom
}

export function normalizeCenterCastSettings(value: unknown): CenterCastSettings {
  const raw = asRecord(value)
  return {
    dynamicSplitEnabled: asBoolean(raw.dynamicSplitEnabled, DEFAULT_CENTER_CAST_SETTINGS.dynamicSplitEnabled),
    splitDistanceFeet: asNumber(raw.splitDistanceFeet, DEFAULT_CENTER_CAST_SETTINGS.splitDistanceFeet, 0, 1000),
    layoutMode: asLayoutMode(raw.layoutMode),
    mainFocus: asMainFocus(raw.mainFocus),
    viewZoom: asViewZoom(raw.viewZoom),
    showPlayerNames: asBoolean(raw.showPlayerNames, DEFAULT_CENTER_CAST_SETTINGS.showPlayerNames),
    showHealthBars: asBoolean(raw.showHealthBars, DEFAULT_CENTER_CAST_SETTINGS.showHealthBars),
    showTokenHints: asBoolean(raw.showTokenHints, DEFAULT_CENTER_CAST_SETTINGS.showTokenHints),
    showFog: asBoolean(raw.showFog, DEFAULT_CENTER_CAST_SETTINGS.showFog),
    hideChromeByDefault: asBoolean(raw.hideChromeByDefault, DEFAULT_CENTER_CAST_SETTINGS.hideChromeByDefault),
  }
}

export function castSettingsToJson(settings: CenterCastSettings): Record<string, unknown> {
  return { ...normalizeCenterCastSettings(settings) }
}
