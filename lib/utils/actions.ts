import type { Token, TokenType } from '@/lib/types/database'

export const ACTIONS_BY_TOKEN_TYPE: Record<TokenType, string[]> = {
  player: ['Talk', 'Inspect', 'Help'],
  npc: ['Talk', 'Inspect', 'Pickpocket', 'Attack'],
  enemy: ['Attack', 'Cast Spell', 'Inspect', 'Help', 'Push', 'Pull'],
  object: ['Inspect', 'Search', 'Open', 'Close', 'Lockpick', 'Use Item', 'Take', 'Read'],
  trap: ['Inspect', 'Search', 'Disarm', 'Avoid'],
  door: ['Open', 'Close', 'Knock', 'Listen', 'Lockpick', 'Break'],
  chest: ['Inspect', 'Search', 'Open', 'Close', 'Lockpick', 'Take'],
  book: ['Inspect', 'Read', 'Take'],
  note: ['Inspect', 'Read', 'Take'],
  loot: ['Inspect', 'Search', 'Take'],
  lever: ['Inspect', 'Pull', 'Activate'],
  switch: ['Inspect', 'Push', 'Pull', 'Activate', 'Use Item'],
  portal: ['Inspect', 'Enter', 'Exit', 'Activate', 'Use Item'],
  key: ['Inspect', 'Take', 'Use'],
  container: ['Inspect', 'Search', 'Open', 'Close', 'Lockpick', 'Take'],
  custom: ['Inspect', 'Custom action'],
}

export const UNIVERSAL_ACTIONS = Array.from(
  new Set(Object.values(ACTIONS_BY_TOKEN_TYPE).flat()),
).sort()

// Returns the action list a player should see for this token, or an empty
// list if the DM has not made the token interactable. The DM's
// `available_actions` always wins when set; otherwise we fall back to a
// sensible default for the token type.
export function actionsForToken(
  token: Pick<Token, 'token_type' | 'available_actions' | 'interactable'>,
) {
  if (!token.interactable) return []

  if (token.available_actions && token.available_actions.length > 0) {
    return token.available_actions
  }

  return ACTIONS_BY_TOKEN_TYPE[token.token_type] ?? ['Inspect']
}

export function distanceFeet(
  actor: Pick<Token, 'x' | 'y'>,
  target: Pick<Token, 'x' | 'y'>,
  gridSize: number,
  gridScaleFeet: number,
) {
  const squareSize = Math.max(1, gridSize)
  const scale = Math.max(1, gridScaleFeet)
  const squares = Math.round(
    Math.max(Math.abs(target.x - actor.x), Math.abs(target.y - actor.y)) /
      squareSize,
  )
  return squares * scale
}
