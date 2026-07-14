export const THEME_KEYS = [
  'emberforge',
  'moonlit-grimoire',
  'emerald-enclave',
  'frostbound-archive',
  'golden-parchment',
] as const

export type ThemeKey = (typeof THEME_KEYS)[number]

export type ThemeColorMode = 'dark' | 'light'

export interface ThemeDefinition {
  key: ThemeKey
  name: string
  description: string
  colorMode: ThemeColorMode
  preview: readonly [string, string, string, string, string]
  colors: {
    canvas: string
    shell: string
    panel: string
    panelRaised: string
    overlay: string
    control: string
    hover: string
    content: string
    muted: string
    faint: string
    onAccent: string
    border: string
    borderStrong: string
    accent: string
    accentHover: string
    accentSoft: string
    success: string
    warning: string
    danger: string
    info: string
    live: string
    playerSafe: string
    dmOnly: string
  }
}

export const DEFAULT_THEME: ThemeKey = 'emberforge'
export const LEGACY_THEME: ThemeKey = 'moonlit-grimoire'
export const THEME_COOKIE = 'companion-theme'

export const THEMES: readonly ThemeDefinition[] = [
  {
    key: 'emberforge',
    name: 'Emberforge',
    description: 'Charcoal, copper, and warm firelight.',
    colorMode: 'dark',
    preview: ['#120f0e', '#211917', '#e58a45', '#fff4e6', '#e06b68'],
    colors: {
      canvas: '#120f0e', shell: '#181311', panel: '#211917', panelRaised: '#2c211d',
      overlay: '#17110f', control: '#2c211d', hover: '#382923', content: '#fff4e6',
      muted: '#d6bea9', faint: '#9b806e', onAccent: '#1a0f08', border: '#4a362c',
      borderStrong: '#705140', accent: '#e58a45', accentHover: '#f2a35f', accentSoft: '#9f5d2e',
      success: '#78d6a3', warning: '#f4c264', danger: '#e06b68', info: '#77bde8',
      live: '#ff765f', playerSafe: '#78d6a3', dmOnly: '#e06b68',
    },
  },
  {
    key: 'moonlit-grimoire',
    name: 'Moonlit Grimoire',
    description: 'Midnight plum, lavender, and mint.',
    colorMode: 'dark',
    preview: ['#100d16', '#241b30', '#b8a7ff', '#f2ecff', '#f0719b'],
    colors: {
      canvas: '#100d16', shell: '#14101c', panel: '#1b1524', panelRaised: '#241b30',
      overlay: '#15101f', control: '#241b30', hover: '#2b2038', content: '#f2ecff',
      muted: '#b8acc7', faint: '#91869f', onAccent: '#100d16', border: '#3a2c49',
      borderStrong: '#59436f', accent: '#b8a7ff', accentHover: '#c9bdff', accentSoft: '#7565a8',
      success: '#67e8c2', warning: '#f5c06a', danger: '#f0719b', info: '#7cc7ff',
      live: '#ff6f91', playerSafe: '#67e8c2', dmOnly: '#f0719b',
    },
  },
  {
    key: 'emerald-enclave',
    name: 'Emerald Enclave',
    description: 'Deep forest, emerald, and pale sage.',
    colorMode: 'dark',
    preview: ['#0c1512', '#203229', '#56c596', '#effaf3', '#d6a85f'],
    colors: {
      canvas: '#0c1512', shell: '#101b17', panel: '#17251f', panelRaised: '#203229',
      overlay: '#0f1915', control: '#203229', hover: '#293e33', content: '#effaf3',
      muted: '#b7d8c3', faint: '#779687', onAccent: '#07130d', border: '#2d493b',
      borderStrong: '#456b57', accent: '#56c596', accentHover: '#6edbab', accentSoft: '#388264',
      success: '#6edbab', warning: '#d6a85f', danger: '#e77982', info: '#73bde8',
      live: '#ff7d75', playerSafe: '#56c596', dmOnly: '#e77982',
    },
  },
  {
    key: 'frostbound-archive',
    name: 'Frostbound Archive',
    description: 'Deep navy, ice blue, and cool silver.',
    colorMode: 'dark',
    preview: ['#0b111c', '#1d304d', '#77c8ff', '#edf6ff', '#8d9cff'],
    colors: {
      canvas: '#0b111c', shell: '#101827', panel: '#15243a', panelRaised: '#1d304d',
      overlay: '#0e1625', control: '#1d304d', hover: '#263c5c', content: '#edf6ff',
      muted: '#b6cde3', faint: '#758ca5', onAccent: '#08111c', border: '#29435f',
      borderStrong: '#3d6287', accent: '#77c8ff', accentHover: '#99d7ff', accentSoft: '#4d8db9',
      success: '#75dfc1', warning: '#f1bd6b', danger: '#ec7892', info: '#8d9cff',
      live: '#ff7694', playerSafe: '#75dfc1', dmOnly: '#ec7892',
    },
  },
  {
    key: 'golden-parchment',
    name: 'Golden Parchment',
    description: 'Warm parchment, burgundy, and antique gold.',
    colorMode: 'light',
    preview: ['#e8d8b7', '#fff5df', '#9a3e45', '#3b2a22', '#b47b28'],
    colors: {
      canvas: '#e8d8b7', shell: '#dfcba5', panel: '#f5e9cf', panelRaised: '#fff5df',
      overlay: '#f1e3c6', control: '#fff5df', hover: '#dec8a0', content: '#3b2a22',
      muted: '#684f41', faint: '#735747', onAccent: '#fff8e9', border: '#c3a77d',
      borderStrong: '#9c7b55', accent: '#9a3e45', accentHover: '#7f3037', accentSoft: '#c4878b',
      success: '#24684f', warning: '#895715', danger: '#a63142', info: '#316b98',
      live: '#b52f43', playerSafe: '#24684f', dmOnly: '#9a3e45',
    },
  },
] as const

export const THEME_BY_KEY = Object.fromEntries(
  THEMES.map((theme) => [theme.key, theme]),
) as Record<ThemeKey, ThemeDefinition>

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && THEME_KEYS.includes(value as ThemeKey)
}

export function normalizeThemeKey(value: unknown): ThemeKey {
  return isThemeKey(value) ? value : DEFAULT_THEME
}
