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

const OPEN_VISIBLE_ACTIONS = new Set(['talk', 'investigate', 'custom action'])
const INTERACTION_GATED_ACTIONS = new Set(['interact', 'use item'])

function normalizedAction(action: string) {
  return action.trim().toLowerCase()
}

function defaultActionsForType(tokenType: TokenType) {
  return ACTIONS_BY_TOKEN_TYPE[tokenType] ?? ['Inspect']
}

function configuredActionsForToken(
  token: Pick<Token, 'token_type' | 'available_actions'>,
) {
  return token.available_actions && token.available_actions.length > 0
    ? token.available_actions
    : defaultActionsForType(token.token_type)
}

function hasConfiguredAction(
  token: Pick<Token, 'token_type' | 'available_actions'>,
  actionType: string,
) {
  const wanted = normalizedAction(actionType)
  return configuredActionsForToken(token).some((action) => normalizedAction(action) === wanted)
}

function isCombatCapableToken(
  token: Pick<Token, 'token_type' | 'available_actions' | 'resolver_type' | 'max_hp' | 'armor_class'>,
) {
  return (
    token.token_type === 'enemy' ||
    token.token_type === 'npc' ||
    token.resolver_type === 'attack' ||
    token.max_hp > 0 ||
    token.armor_class > 10 ||
    hasConfiguredAction(token, 'Attack')
  )
}

export type ActionAuthorizationReason =
  | 'allowed'
  | 'hidden'
  | 'self_target'
  | 'portal'
  | 'attack_not_enabled'
  | 'interaction_not_enabled'
  | 'spell_not_enabled'
  | 'unknown_action'

export function authorizePlayerActionTarget(
  actionType: string,
  target: Pick<
    Token,
    | 'id'
    | 'name'
    | 'token_type'
    | 'visible_to_players'
    | 'available_actions'
    | 'interactable'
    | 'resolver_type'
    | 'max_hp'
    | 'armor_class'
  >,
  actor?: Pick<Token, 'id'> | null,
): { allowed: boolean; reason: ActionAuthorizationReason; message: string } {
  const action = normalizedAction(actionType)
  const targetName = target.name || 'Target'

  if (target.visible_to_players === false) {
    return { allowed: false, reason: 'hidden', message: `${targetName} is not visible to players.` }
  }
  if (actor?.id && actor.id === target.id) {
    return { allowed: false, reason: 'self_target', message: 'Choose a different target.' }
  }
  if (target.token_type === 'portal') {
    return { allowed: false, reason: 'portal', message: 'Use the travel prompt for portals.' }
  }

  if (action === 'attack') {
    if (!isCombatCapableToken(target)) {
      return { allowed: false, reason: 'attack_not_enabled', message: `${targetName} is not enabled for attacks.` }
    }
    return { allowed: true, reason: 'allowed', message: 'Allowed.' }
  }

  if (OPEN_VISIBLE_ACTIONS.has(action)) {
    return { allowed: true, reason: 'allowed', message: 'Allowed.' }
  }

  if (INTERACTION_GATED_ACTIONS.has(action)) {
    if (!target.interactable && !hasConfiguredAction(target, actionType)) {
      return {
        allowed: false,
        reason: 'interaction_not_enabled',
        message: `The DM has not enabled ${actionType} for ${targetName}.`,
      }
    }
    return { allowed: true, reason: 'allowed', message: 'Allowed.' }
  }

  if (action === 'cast spell') {
    if (!hasConfiguredAction(target, actionType)) {
      return {
        allowed: false,
        reason: 'spell_not_enabled',
        message: `The DM has not enabled spell targeting for ${targetName}.`,
      }
    }
    return { allowed: true, reason: 'allowed', message: 'Allowed.' }
  }

  if (!target.interactable && !hasConfiguredAction(target, actionType)) {
    return {
      allowed: false,
      reason: 'interaction_not_enabled',
      message: `The DM has not enabled ${actionType} for ${targetName}.`,
    }
  }

  if (!hasConfiguredAction(target, actionType)) {
    return { allowed: false, reason: 'unknown_action', message: `${actionType} is not available for ${targetName}.` }
  }

  return { allowed: true, reason: 'allowed', message: 'Allowed.' }
}

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
