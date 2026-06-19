'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleX,
  Dices,
  Hand,
  Hourglass,
  Mail,
  Megaphone,
  MessageCircle,
  MousePointer2,
  Package,
  ScrollText,
  Search,
  Send,
  Sparkles,
  Swords,
  Users,
  WandSparkles,
  X,
} from 'lucide-react'
import { MapCanvas, type RenderArea, type RenderToken } from './MapCanvas'
import { useTokenRealtime } from '@/lib/hooks/useTokenRealtime'
import { useRealtimeRefresh } from '@/lib/hooks/useRealtimeRefresh'
import {
  createTravelParty,
  movePlayerToken,
  respondTravelPartyInvite,
  setMapTravelOptions,
} from '@/lib/actions/maps'
import { submitActionIntent } from '@/lib/actions/action-intents'
import { travelThroughTransport } from '@/lib/actions/transport'
import { sendDMNudge, sendPartyMessage } from '@/lib/actions/party-messages'
import {
  markRollRequestRolling,
  submitAttackRollResult,
  submitHpEffectRollResult,
  submitRollResult,
} from '@/lib/actions/roll-requests'
import { getRollOutcomeVariant } from '@/lib/utils/roll-outcome-display'
import { PlayerRollOutcomePanel, type PlayerRollOutcomeData } from '@/components/actions/RollOutcomeEffects'
import { PlayerLinkedCodexDocsPanel } from '@/components/codex/CodexLinkedDocsPanel'
import { createClient } from '@/lib/supabase/client'
import { actionsForToken, distanceFeet } from '@/lib/utils/actions'
import type { NpcRevealPayload } from '@/lib/notion/npc-profile'
import {
  type ActionIntent,
  type ActionIntentStatus,
  type ActionResult,
  type ActionRollRequest,
  type ActionRollResult,
  type AdvantageState,
  type CampaignDocLinkPublication,
  type CampaignDocLiveObjectType,
  type GameMap,
  type MapRevealedArea,
  type MapTransportConfirmation,
  type MapTravelParty,
  type MapTravelPartyMember,
  type MoveTokenResult,
  type PlayerVisibleCampaignDoc,
  type Profile,
  type Token,
  type TokenType,
  type TravelMode,
} from '@/lib/types/database'

function mergeTokenList(tokens: Token[], token: Token) {
  const next = tokens.filter((t) => t.id !== token.id)
  next.push(token)
  return next
}

function removeDuplicateTokens(tokens: Token[]) {
  const byId = new Map<string, Token>()
  tokens.forEach((token) => byId.set(token.id, token))
  return Array.from(byId.values())
}

function rollRequestHpEffect(req: ActionRollRequest | null) {
  const raw = req?.roll_context?.hpEffect
  if (!raw || typeof raw !== 'object') return null
  const effect = raw as Record<string, unknown>
  const kind = effect.kind === 'healing' ? 'healing' : effect.kind === 'damage' ? 'damage' : null
  const formula = typeof effect.formula === 'string' ? effect.formula.trim() : ''
  if (!kind || !formula) return null
  return { kind, formula }
}

function mergeAreaList(areas: MapRevealedArea[], area: MapRevealedArea) {
  const next = areas.filter((a) => a.id !== area.id)
  next.push(area)
  return next
}

function removeDuplicateAreas(areas: MapRevealedArea[]) {
  const byId = new Map<string, MapRevealedArea>()
  areas.forEach((area) => byId.set(area.id, area))
  return Array.from(byId.values())
}

interface PlayerMapViewProps {
  campaignId: string
  map: GameMap
  imageUrl: string
  initialTokens: Token[]
  initialAreas: MapRevealedArea[]
  currentUserId: string
  // speed by character id, for tokens this player controls
  characterSpeeds: Record<string, number>
  // this player's own characters, for submitting contextual actions
  myCharacters: { id: string; name: string }[]
  partyMembers: { userId: string; role: string; profile: Profile | null }[]
  playerCodexDocs?: PlayerVisibleCampaignDoc[]
  playerCodexLinks?: CampaignDocLinkPublication[]
  initialTravelParties?: MapTravelParty[]
  initialTravelPartyMembers?: MapTravelPartyMember[]
  initialTransportConfirmations?: MapTransportConfirmation[]
}

const OBJECT_TOKEN_TYPES = new Set<TokenType>([
  'object',
  'trap',
  'door',
  'chest',
  'book',
  'note',
  'loot',
  'lever',
  'switch',
  'portal',
  'key',
  'container',
  'custom',
])

function codexObjectTypeForToken(token: Token): CampaignDocLiveObjectType {
  return OBJECT_TOKEN_TYPES.has(token.token_type) ? 'object' : 'token'
}

type InteractionSection = 'root' | 'action' | 'requests' | 'talk' | 'travel' | 'whisper' | 'announcement'
type ActionSequenceState =
  | 'idle'
  | 'token_selected'
  | 'choosing_action'
  | 'submitting_request'
  | 'awaiting_dm'
  | 'approved'
  | 'denied'
  | 'resolving_primary_roll'
  | 'resolving_secondary_roll'
  | 'completed'
  | 'cancelled'
type GuidedActionType = string
type SelectedToolType = 'Weapon' | 'Item' | 'Spell' | 'Object' | 'Creature' | 'Detail' | 'Custom'
type ActionToolOption = {
  id: string
  type: SelectedToolType
  name: string
  source: string
  note?: string | null
}

const GUIDED_ACTION_TYPES: {
  type: GuidedActionType
  label: string
  description: string
  icon: React.ReactNode
  tone: string
}[] = [
  {
    type: 'Attack',
    label: 'Attack',
    description: 'Strike, shoot, grapple, or threaten a hostile target.',
    icon: <Swords className="h-4 w-4" aria-hidden="true" />,
    tone: 'border-red-500/40 bg-red-500/10 text-red-100',
  },
  {
    type: 'Interact',
    label: 'Interact',
    description: 'Manipulate an object, door, lever, device, or scene element.',
    icon: <MousePointer2 className="h-4 w-4" aria-hidden="true" />,
    tone: 'border-sky-500/40 bg-sky-500/10 text-sky-100',
  },
  {
    type: 'Talk',
    label: 'Talk',
    description: 'Address a creature, negotiate, warn, distract, or ask.',
    icon: <MessageCircle className="h-4 w-4" aria-hidden="true" />,
    tone: 'border-violet-500/40 bg-violet-500/10 text-violet-100',
  },
  {
    type: 'Investigate',
    label: 'Investigate',
    description: 'Study details, search for clues, inspect, or test a theory.',
    icon: <Search className="h-4 w-4" aria-hidden="true" />,
    tone: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
  },
  {
    type: 'Use Item',
    label: 'Use Item',
    description: 'Use gear, tools, potions, keys, or a prepared object.',
    icon: <Package className="h-4 w-4" aria-hidden="true" />,
    tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  },
  {
    type: 'Cast Spell',
    label: 'Cast Spell',
    description: 'Cast a spell or magical feature at a target or location.',
    icon: <WandSparkles className="h-4 w-4" aria-hidden="true" />,
    tone: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-100',
  },
  {
    type: 'Custom Action',
    label: 'Custom Action',
    description: 'Describe anything else you want the DM to adjudicate.',
    icon: <ScrollText className="h-4 w-4" aria-hidden="true" />,
    tone: 'border-zinc-600 bg-zinc-900 text-zinc-100',
  },
]

function isGuidedPlayerAction(actionType: string) {
  return GUIDED_ACTION_TYPES.some((item) => item.type === actionType)
}

function toolCopyForAction(actionType: GuidedActionType) {
  if (actionType === 'Attack') {
    return {
      label: 'Choose Weapon',
      placeholder: 'Select the weapon you want to attack with.',
      type: 'Weapon' as SelectedToolType,
    }
  }
  if (actionType === 'Use Item') {
    return {
      label: 'Choose Item',
      placeholder: 'Select the item you want to use.',
      type: 'Item' as SelectedToolType,
    }
  }
  if (actionType === 'Cast Spell') {
    return {
      label: 'Choose Spell',
      placeholder: 'Select the spell you want to cast.',
      type: 'Spell' as SelectedToolType,
    }
  }
  if (actionType === 'Interact') {
    return {
      label: 'Choose Object',
      placeholder: 'Select what you want to interact with.',
      type: 'Object' as SelectedToolType,
    }
  }
  if (actionType === 'Talk') {
    return {
      label: 'Choose Creature',
      placeholder: 'Select who you want to talk to.',
      type: 'Creature' as SelectedToolType,
    }
  }
  if (actionType === 'Investigate') {
    return {
      label: 'Choose Detail',
      placeholder: 'Select what you want to investigate.',
      type: 'Detail' as SelectedToolType,
    }
  }
  return {
    label: 'Choose Tool or Object',
    placeholder: 'Select anything relevant to this action.',
    type: 'Custom' as SelectedToolType,
  }
}

function fallbackToolOptions(actionType: GuidedActionType, target: Token | null): ActionToolOption[] {
  const targetName = target?.name || target?.token_type || 'Selected target'
  if (actionType === 'Attack') {
    return [
      { id: 'fallback:sword', type: 'Weapon', name: 'Sword', source: 'Fallback' },
      { id: 'fallback:bow', type: 'Weapon', name: 'Bow', source: 'Fallback' },
      { id: 'fallback:dagger', type: 'Weapon', name: 'Dagger', source: 'Fallback' },
      { id: 'fallback:unarmed', type: 'Weapon', name: 'Unarmed Strike', source: 'Fallback' },
    ]
  }
  if (actionType === 'Use Item') {
    return [
      { id: 'fallback:potion', type: 'Item', name: 'Healing Potion', source: 'Fallback' },
      { id: 'fallback:key', type: 'Item', name: 'Key', source: 'Fallback' },
      { id: 'fallback:rope', type: 'Item', name: 'Rope', source: 'Fallback' },
      { id: 'fallback:torch', type: 'Item', name: 'Torch', source: 'Fallback' },
      { id: 'fallback:other-item', type: 'Item', name: 'Other item', source: 'Fallback' },
    ]
  }
  if (actionType === 'Cast Spell') {
    return [
      { id: 'fallback:fire-bolt', type: 'Spell', name: 'Fire Bolt', source: 'Fallback' },
      { id: 'fallback:mage-hand', type: 'Spell', name: 'Mage Hand', source: 'Fallback' },
      { id: 'fallback:other-spell', type: 'Spell', name: 'Other spell', source: 'Fallback' },
    ]
  }
  if (actionType === 'Talk') {
    return [{ id: target?.id ?? 'fallback:creature', type: 'Creature', name: targetName, source: 'Map' }]
  }
  if (actionType === 'Investigate') {
    return [{ id: target?.id ?? 'fallback:detail', type: 'Detail', name: targetName, source: 'Map' }]
  }
  if (actionType === 'Interact') {
    return [{ id: target?.id ?? 'fallback:object', type: 'Object', name: targetName, source: 'Map' }]
  }
  return [
    { id: target?.id ?? 'fallback:custom', type: 'Custom', name: targetName, source: 'Map' },
    { id: 'fallback:other', type: 'Custom', name: 'Other relevant tool/object', source: 'Fallback' },
  ]
}

function actionToolPhrase(actionType: string, targetName?: string | null, toolName?: string | null) {
  const target = targetName || 'target'
  if (!toolName) return `${actionType} ${target}`
  if (actionType === 'Attack') return `Attack ${target} with ${toolName}`
  if (actionType === 'Use Item') return `Use ${toolName}${targetName ? ` on ${targetName}` : ''}`
  if (actionType === 'Cast Spell') return `Cast ${toolName}${targetName ? ` at ${targetName}` : ''}`
  if (actionType === 'Talk') return `Talk to ${targetName || toolName}`
  if (actionType === 'Investigate') return `Investigate ${toolName}`
  if (actionType === 'Interact') return `Interact with ${toolName}`
  return `${actionType}${targetName ? ` ${targetName}` : ''} with ${toolName}`
}

function randomD20() {
  return Math.floor(Math.random() * 20) + 1
}

function isNpcRevealPayload(value: unknown): value is NpcRevealPayload {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'npc_profile' &&
    typeof (value as { title?: unknown }).title === 'string',
  )
}

export function PlayerMapView({
  campaignId,
  map,
  imageUrl,
  initialTokens,
  initialAreas,
  currentUserId,
  characterSpeeds,
  myCharacters,
  partyMembers,
  playerCodexDocs = [],
  playerCodexLinks = [],
  initialTravelParties = [],
  initialTravelPartyMembers = [],
  initialTransportConfirmations = [],
}: PlayerMapViewProps) {
  const router = useRouter()
  const [tokens, setTokens] = useState<Token[]>(() =>
    removeDuplicateTokens(initialTokens),
  )
  const [areas, setAreas] = useState<MapRevealedArea[]>(() =>
    removeDuplicateAreas(initialAreas),
  )
  const [mapState, setMapState] = useState(map)
  const [mapLocked, setMapLocked] = useState(map.player_movement_locked)
  const travelParties = initialTravelParties
  const travelPartyMembers = initialTravelPartyMembers
  const transportConfirmations = initialTransportConfirmations
  const [transportBusy, setTransportBusy] = useState(false)
  const [transportFeedback, setTransportFeedback] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [interactionOpen, setInteractionOpen] = useState(false)
  const [section, setSection] = useState<InteractionSection>('root')
  const [myRequests, setMyRequests] = useState<ActionIntent[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [partyMessage, setPartyMessage] = useState('')
  const [whisperRecipient, setWhisperRecipient] = useState('')
  const [talkFeedback, setTalkFeedback] = useState<string | null>(null)
  const [talkBusy, setTalkBusy] = useState<string | null>(null)
  const [partyName, setPartyName] = useState('Travel Party')
  const [nominatedLeaderId, setNominatedLeaderId] = useState(currentUserId)
  const [selectedPartyMemberIds, setSelectedPartyMemberIds] = useState<string[]>([currentUserId])
  const [travelFeedback, setTravelFeedback] = useState<string | null>(null)
  const [travelBusy, setTravelBusy] = useState<string | null>(null)
  const [actionFlow, setActionFlow] = useState<ActionSequenceState>('idle')
  const [actionTargetId, setActionTargetId] = useState<string | null>(null)
  const [guidedActionType, setGuidedActionType] = useState<GuidedActionType>('Attack')
  const [selectedToolId, setSelectedToolId] = useState('')
  const [toolOptions, setToolOptions] = useState<ActionToolOption[]>([])
  const [toolsLoading, setToolsLoading] = useState(false)
  const [guidedActionMessage, setGuidedActionMessage] = useState('')
  const [guidedIntent, setGuidedIntent] = useState<ActionIntent | null>(null)
  const [guidedIntentId, setGuidedIntentId] = useState<string | null>(null)
  const [activeRollRequest, setActiveRollRequest] = useState<ActionRollRequest | null>(null)
  const [inlineRollResult, setInlineRollResult] = useState<ActionRollResult | null>(null)
  const [npcRevealPayload, setNpcRevealPayload] = useState<NpcRevealPayload | null>(null)
  const [inlineRollBusy, setInlineRollBusy] = useState(false)
  const [inlineRollAnimating, setInlineRollAnimating] = useState(false)
  // Inline roll sub-flow (automatic / manual / attack-damage), mirroring the
  // dedicated roll popup but rendered inside the action request menu.
  const [inlineRollMode, setInlineRollMode] = useState<'choice' | 'manual' | 'damage'>('choice')
  const [inlineManualOne, setInlineManualOne] = useState('')
  const [inlineManualTwo, setInlineManualTwo] = useState('')
  const [inlineAnimNumber, setInlineAnimNumber] = useState<number | null>(null)
  const [inlinePendingDamage, setInlinePendingDamage] = useState<{
    formula: string
    diceCount: number
    dieSize: number
    critical: boolean
    naturalRoll: number
    secondNaturalRoll: number | null
  } | null>(null)
  const [inlineDamageTotal, setInlineDamageTotal] = useState('')
  // Shared outcome panel data (reuses PlayerRollOutcomePanel + its effects).
  const [inlineOutcome, setInlineOutcome] = useState<PlayerRollOutcomeData | null>(null)
  // Tracks the last fresh roll request we reset the inline UI for, so a new
  // request (or DM reroll) resets the sub-flow exactly once.
  const handledRollRequestIdRef = useRef<string | null>(null)
  const [guidedError, setGuidedError] = useState<string | null>(null)
  const [nudgeBusy, setNudgeBusy] = useState(false)
  const [nudgeCooldownUntil, setNudgeCooldownUntil] = useState<number | null>(null)

  // Live sync: if the DM activates a *different* map (or changes this map's
  // image/grid/name), re-fetch the server-rendered route so the player's view
  // swaps to the new active map (or picks up the new settings) with no manual
  // refresh. useTokenRealtime below handles in-place token/area/lock updates
  // for the currently-active map; this catches "the active map itself changed".
  useRealtimeRefresh(`maps-watch-${campaignId}`, [
    { table: 'maps', filter: `campaign_id=eq.${campaignId}` },
    { table: 'campaign_doc_publications', filter: `campaign_id=eq.${campaignId}` },
    { table: 'campaign_doc_link_publications', filter: `campaign_id=eq.${campaignId}` },
    { table: 'map_travel_parties', filter: `map_id=eq.${map.id}` },
    { table: 'map_travel_party_members', filter: `map_id=eq.${map.id}` },
    { table: 'map_transport_confirmations', filter: `map_id=eq.${map.id}` },
  ])

  useTokenRealtime(map.id, campaignId, {
    onUpsert: (row) => {
      const token = row as Token
      setTokens((prev) => mergeTokenList(prev, token))
    },
    onDelete: (id) => {
      setTokens((prev) => prev.filter((t) => t.id !== id))
      setSelectedId((cur) => (cur === id ? null : cur))
    },
    onMapChange: (m) => {
      setMapState(m)
      setMapLocked(m.player_movement_locked)
    },
    onAreaUpsert: (area) => setAreas((prev) => mergeAreaList(prev, area)),
    onAreaDelete: (id) => setAreas((prev) => prev.filter((a) => a.id !== id)),
  })

  const loadMyRequests = useCallback(async () => {
    setRequestsLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('action_intents')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('actor_user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(8)
    setMyRequests((data ?? []) as ActionIntent[])
    setRequestsLoading(false)
  }, [campaignId, currentUserId])

  useEffect(() => {
    if (!interactionOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInteractionOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [interactionOpen])

  useEffect(() => {
    if (!interactionOpen || section !== 'requests') return
    const timer = window.setTimeout(() => {
      void loadMyRequests()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [interactionOpen, loadMyRequests, section])

  const renderAreas: RenderArea[] = areas.map((a) => ({
    id: a.id,
    shape_type: a.shape_type,
    x: a.x,
    y: a.y,
    width: a.width,
    height: a.height,
    radius: a.radius,
  }))

  const controls = (t: Token) => t.controlled_by_user_id === currentUserId

  function canDrag(id: string) {
    const t = tokens.find((x) => x.id === id)
    if (!t) return false
    return controls(t) && !t.movement_locked && !mapLocked
  }

  async function handleMove(id: string, x: number, y: number) {
    const prev = tokens.find((t) => t.id === id)
    if (!prev) return
    const prevX = prev.x
    const prevY = prev.y

    // optimistic
    setTokens((p) => p.map((t) => (t.id === id ? { ...t, x, y } : t)))
    setWarning(null)

    const result = (await movePlayerToken(id, x, y)) as MoveTokenResult

    if (result?.error) {
      // revert
      setTokens((p) => p.map((t) => (t.id === id ? { ...t, x: prevX, y: prevY } : t)))
      setWarning(result.error)
      setTimeout(() => setWarning(null), 4000)
    } else if (typeof result?.movement_used === 'number') {
      const used = result.movement_used
      setTokens((p) => p.map((t) => (t.id === id ? { ...t, movement_used: used } : t)))
    }
  }

  const renderTokens: RenderToken[] = tokens.map((t) => ({
    id: t.id,
    token_type: t.token_type,
    name: t.name,
    x: t.x,
    y: t.y,
    size: t.size,
    color: t.color,
    visible_to_players: t.visible_to_players,
    max_hp: t.max_hp,
    current_hp: t.current_hp,
    temp_hp: t.temp_hp,
    is_defeated: t.is_defeated,
    showHealth: t.visible_to_players !== false && (t.max_hp ?? 0) > 0,
    dimmed: t.visible_to_players === false,
  }))

  const selected = tokens.find((t) => t.id === selectedId) ?? null
  const myControlled = tokens.filter(controls)
  // Portals are excluded — they are travel points, not action targets.
  const visibleTargets = tokens.filter(
    (token) => token.visible_to_players !== false && token.token_type !== 'portal',
  )
  const actionTarget = visibleTargets.find((token) => token.id === actionTargetId) ?? null

  const actorForActionTarget = useMemo(() => {
    if (!actionTarget) return null
    let best: { actor: Token; distance: number } | null = null
    for (const actor of myControlled) {
      if (!actor.linked_character_id) continue
      if (!myCharacters.some((c) => c.id === actor.linked_character_id)) continue
      if (actor.id === actionTarget.id) continue
      const distance = distanceFeet(actor, actionTarget, map.grid_size, map.grid_scale_feet)
      if (!best || distance < best.distance) best = { actor, distance }
    }
    return best
  }, [actionTarget, myCharacters, myControlled, map.grid_size, map.grid_scale_feet])

  // Nearest of my characters' tokens to the selected target, for range checks
  // and as the actor for contextual-action submission.
  const nearestActor = useMemo(() => {
    if (!selected) return null
    let best: { actor: Token; distance: number } | null = null
    for (const actor of myControlled) {
      if (!actor.linked_character_id) continue
      if (!myCharacters.some((c) => c.id === actor.linked_character_id)) continue
      const distance = distanceFeet(actor, selected, map.grid_size, map.grid_scale_feet)
      if (!best || distance < best.distance) best = { actor, distance }
    }
    return best
  }, [myCharacters, myControlled, map.grid_size, map.grid_scale_feet, selected])

  const isTransport = selected?.token_type === 'portal'
  const selectedHiddenHint = Boolean(selected && selected.visible_to_players === false)

  const contextualActions = useMemo(() => {
    if (!selected || selected.controlled_by_user_id === currentUserId) return []
    if (!selected.visible_to_players || !selected.interactable) return []
    if (selected.token_type === 'portal') return []
    return actionsForToken(selected)
  }, [currentUserId, selected])

  // Players who control a character on this map — the voter set for party-mode
  // transport travel.
  const transportVoters = useMemo(() => {
    const set = new Set<string>()
    tokens.forEach((token) => {
      if (token.token_type === 'player' && token.controlled_by_user_id) {
        set.add(token.controlled_by_user_id)
      }
    })
    return set
  }, [tokens])

  const transportNeedsVote =
    isTransport && mapState.travel_mode === 'group_party' && transportVoters.size > 1

  const transportTally = useMemo(() => {
    if (!selected) return { confirmed: 0, mine: false }
    const confirmedUsers = new Set(
      transportConfirmations
        .filter((c) => c.token_id === selected.id && transportVoters.has(c.user_id))
        .map((c) => c.user_id),
    )
    return { confirmed: confirmedUsers.size, mine: confirmedUsers.has(currentUserId) }
  }, [selected, transportConfirmations, transportVoters, currentUserId])

  async function handleTransportTravel() {
    if (!selected) return
    setTransportBusy(true)
    setTransportFeedback(null)
    const result = await travelThroughTransport(campaignId, selected.id)
    setTransportBusy(false)
    if ('error' in result) {
      setTransportFeedback(result.error)
      return
    }
    if (result.traveled) {
      setTransportFeedback('Traveling…')
      setSelectedId(null)
      router.refresh()
    } else {
      setTransportFeedback(`Vote placed — ${result.confirmed}/${result.needed} confirmed.`)
    }
  }

  const selectedTool = useMemo(
    () => toolOptions.find((option) => option.id === selectedToolId) ?? toolOptions[0] ?? null,
    [selectedToolId, toolOptions],
  )

  useEffect(() => {
    const actorCharacterId = actorForActionTarget?.actor.linked_character_id
    const fallback = fallbackToolOptions(guidedActionType, actionTarget)
    let cancelled = false

    async function loadTools() {
      setToolsLoading(true)
      if (!actorCharacterId) {
        setToolOptions(fallback)
        setSelectedToolId((current) => current || fallback[0]?.id || '')
        setToolsLoading(false)
        return
      }

      const supabase = createClient()
      const [{ data: attacks }, { data: inventory }, { data: spells }] = await Promise.all([
        supabase
          .from('character_attacks')
          .select('id,name,attack_type,equipped,damage_dice,damage_type,range_normal')
          .eq('character_id', actorCharacterId)
          .order('equipped', { ascending: false }),
        supabase
          .from('character_inventory_items')
          .select('id,name,equipped,quantity,magical,description')
          .eq('character_id', actorCharacterId)
          .order('equipped', { ascending: false }),
        supabase
          .from('character_spells')
          .select('id,name,spell_level,prepared,uses')
          .eq('character_id', actorCharacterId)
          .order('prepared', { ascending: false }),
      ])

      if (cancelled) return

      const next: ActionToolOption[] = []
      if (guidedActionType === 'Attack') {
        ;(attacks ?? []).forEach((attack) => {
          next.push({
            id: `attack:${attack.id}`,
            type: 'Weapon',
            name: attack.name,
            source: attack.equipped ? 'Equipped attack' : 'Character attack',
            note: attack.damage_dice ? `${attack.damage_dice}${attack.damage_type ? ` ${attack.damage_type}` : ''}` : attack.attack_type,
          })
        })
      } else if (guidedActionType === 'Use Item' || guidedActionType === 'Custom Action') {
        ;(inventory ?? []).forEach((item) => {
          next.push({
            id: `item:${item.id}`,
            type: 'Item',
            name: item.name,
            source: item.equipped ? 'Equipped item' : 'Inventory',
            note: item.quantity > 1 ? `Qty ${item.quantity}` : item.magical ? 'Magical' : item.description,
          })
        })
      } else if (guidedActionType === 'Cast Spell') {
        ;(spells ?? []).forEach((spell) => {
          next.push({
            id: `spell:${spell.id}`,
            type: 'Spell',
            name: spell.name,
            source: spell.prepared || spell.spell_level === 0 ? 'Prepared spell' : 'Known spell',
            note: spell.spell_level === 0 ? 'Cantrip' : `Level ${spell.spell_level}`,
          })
        })
      }

      if (guidedActionType === 'Interact' || guidedActionType === 'Talk' || guidedActionType === 'Investigate' || guidedActionType === 'Custom Action') {
        fallback
          .filter((option) => !next.some((existing) => existing.id === option.id))
          .forEach((option) => next.push(option))
      }

      fallback
        .filter((option) => !next.some((existing) => existing.name.toLowerCase() === option.name.toLowerCase()))
        .forEach((option) => next.push(option))

      const options = next.length ? next : fallback
      setToolOptions(options)
      setSelectedToolId((current) => options.some((option) => option.id === current) ? current : options[0]?.id || '')
      setToolsLoading(false)
    }

    void loadTools()
    return () => {
      cancelled = true
    }
  }, [actionTarget, actorForActionTarget?.actor.linked_character_id, guidedActionType])

  const openGuidedAction = useCallback((targetId?: string | null, actionType?: string) => {
    const nextTargetId = targetId ?? selectedId ?? visibleTargets.find((token) => token.controlled_by_user_id !== currentUserId)?.id ?? null
    if (nextTargetId) {
      setSelectedId(nextTargetId)
      setActionTargetId(nextTargetId)
      setActionFlow('token_selected')
    } else {
      setActionFlow('choosing_action')
    }
    if (actionType) {
      setGuidedActionType(actionType === 'Custom action' ? 'Custom Action' : actionType)
      setSelectedToolId('')
      setGuidedActionMessage('')
    }
    setInteractionOpen(false)
    setSection('root')
    setGuidedError(null)
    setGuidedIntent(null)
    setGuidedIntentId(null)
    window.setTimeout(() => setActionFlow('choosing_action'), 120)
  }, [currentUserId, selectedId, visibleTargets])

  const startActionDraft = useCallback((actionType: string, targetId?: string | null) => {
    openGuidedAction(targetId ?? selectedId, actionType)
  }, [openGuidedAction, selectedId])

  function closeGuidedAction() {
    setActionFlow('idle')
    setGuidedError(null)
    setGuidedIntent(null)
    setGuidedIntentId(null)
    setNpcRevealPayload(null)
    setNudgeCooldownUntil(null)
  }

  async function submitGuidedAction() {
    if (!actionTarget || !actorForActionTarget?.actor.linked_character_id) {
      setGuidedError('Choose a target and make sure one of your character tokens can act.')
      return
    }

    setActionFlow('submitting_request')
    setGuidedError(null)
    setNpcRevealPayload(null)
    const result = await submitActionIntent(
      campaignId,
      map.id,
      actorForActionTarget.actor.linked_character_id,
      actionTarget.id,
      guidedActionType,
      guidedActionMessage,
      selectedTool ? {
        type: selectedTool.type,
        id: selectedTool.id,
        name: selectedTool.name,
      } : undefined,
    )

    if (result?.error) {
      setActionFlow('choosing_action')
      setGuidedError(result.error)
      return
    }

    setGuidedIntentId(result.intentId ?? null)
    setGuidedIntent({
      id: result.intentId ?? 'pending',
      campaign_id: campaignId,
      map_id: map.id,
      encounter_id: null,
      actor_user_id: currentUserId,
      actor_character_id: actorForActionTarget.actor.linked_character_id,
      target_token_id: actionTarget.id,
      action_type: guidedActionType,
      message: guidedActionMessage.trim() || null,
      selected_tool_type: selectedTool?.type ?? null,
      selected_tool_id: selectedTool?.id ?? null,
      selected_tool_name: selectedTool?.name ?? null,
      status: 'pending',
      distance_feet: actorForActionTarget.distance,
      range_feet: actionTarget.interaction_range_feet ?? 60,
      dm_response: null,
      response_visibility: 'actor',
      resolver_type: guidedActionType === 'Attack' ? 'attack' : guidedActionType === 'Use Item' || guidedActionType === 'Interact' ? 'object_state' : 'manual',
      resolver_status: 'idle',
      created_at: new Date().toISOString(),
      resolved_at: null,
      resolved_by: null,
    })
    setActionFlow('awaiting_dm')
    setGuidedActionMessage('')
    void loadMyRequests()
  }

  async function nudgeDM() {
    const now = Date.now()
    if (nudgeCooldownUntil && nudgeCooldownUntil > now) return
    setNudgeBusy(true)
    const result = await sendDMNudge(campaignId, {
      actionType: guidedActionType,
      targetName: actionTarget?.name ?? actionTarget?.token_type ?? null,
      intentId: guidedIntentId,
      waitingSince: guidedIntent?.created_at ?? null,
    })
    setNudgeBusy(false)
    if (result?.error) {
      setGuidedError(result.error)
      return
    }
    setNudgeCooldownUntil(Date.now() + 30000)
  }

  function inlineUsedRoll(advantage: AdvantageState, first: number, second: number | null) {
    if (advantage === 'advantage') return Math.max(first, second ?? first)
    if (advantage === 'disadvantage') return Math.min(first, second ?? first)
    return first
  }

  function inlineGenericSummary(total: number, targetNumber: number | null, naturalRoll: number) {
    const variant = getRollOutcomeVariant({ naturalRoll })
    const targetText = targetNumber !== null ? ` Target number was ${targetNumber}.` : ''
    if (variant === 'critical_failure') return `Natural 1 — critical failure. Total ${total}.${targetText}`
    if (variant === 'critical_success') return `Natural 20 — critical success! Total ${total}.${targetText}`
    return `Your total was ${total}.${targetText}`
  }

  /** Roll one request, automatic or manual, generic or attack. Sends to the DM. */
  async function finishInlineRoll(
    req: ActionRollRequest,
    rollMode: 'automatic' | 'manual',
    naturalRoll: number,
    secondNaturalRoll: number | null,
    manualDamageDiceTotal?: number | null,
  ) {
    const isAttack = req.roll_type === 'weapon_attack' || req.roll_type === 'attack'
    const hpEffect = rollRequestHpEffect(req)
    const used = inlineUsedRoll(req.advantage_state, naturalRoll, secondNaturalRoll)
    const title = req.label || actionToolPhrase(guidedActionType, actionTarget?.name ?? actionTarget?.token_type ?? null, guidedIntent?.selected_tool_name)

    if (hpEffect) {
      const result = await submitHpEffectRollResult(campaignId, req.id, {
        rollMode,
        manualDiceTotal: rollMode === 'manual' ? naturalRoll : null,
      })
      setInlineRollBusy(false)
      setInlineRollAnimating(false)
      setInlineAnimNumber(null)
      if ('error' in result) {
        setGuidedError(result.error)
        setInlineRollMode('choice')
        return
      }
      setInlineOutcome({
        variant: 'success',
        title,
        naturalRoll: 10,
        secondNaturalRoll: null,
        usedNaturalRoll: 10,
        modifier: 0,
        total: result.total,
        targetNumber: null,
        summary: result.summary,
        reviewPending: true,
        resolved: false,
      })
      setInlineRollMode('choice')
      setActionFlow('resolving_primary_roll')
      void loadMyRequests()
      return
    }

    if (isAttack) {
      const result = await submitAttackRollResult(campaignId, req.id, {
        rollMode,
        naturalRoll,
        secondNaturalRoll,
        damageMode: manualDamageDiceTotal === undefined ? undefined : 'manual',
        manualDamageDiceTotal: manualDamageDiceTotal ?? null,
      })
      setInlineRollBusy(false)
      setInlineRollAnimating(false)
      setInlineAnimNumber(null)
      if ('error' in result) {
        setGuidedError(result.error)
        setInlineRollMode('choice')
        return
      }
      if ('needsDamage' in result) {
        setInlinePendingDamage({
          formula: result.damageFormula,
          diceCount: result.damageDiceCount,
          dieSize: result.damageDieSize,
          critical: result.critical,
          naturalRoll,
          secondNaturalRoll,
        })
        setInlineRollMode('damage')
        return
      }
      setInlineOutcome({
        variant: getRollOutcomeVariant({ attackOutcome: result.outcome, naturalRoll }),
        title,
        naturalRoll,
        secondNaturalRoll,
        usedNaturalRoll: used,
        modifier: req.modifier,
        total: result.total,
        targetNumber: req.target_number,
        summary: result.summary,
        damageTotal: result.damageTotal,
        damageType: null,
        reviewPending: true,
        resolved: false,
      })
      setInlineRollMode('choice')
      setActionFlow('resolving_primary_roll')
      void loadMyRequests()
      return
    }

    const result = await submitRollResult(campaignId, req.id, { rollMode, naturalRoll, secondNaturalRoll })
    setInlineRollBusy(false)
    setInlineRollAnimating(false)
    setInlineAnimNumber(null)
    if (result?.error) {
      setGuidedError(result.error)
      setInlineRollMode('choice')
      return
    }
    const total = result.total ?? used + req.modifier
    setInlineOutcome({
      variant: getRollOutcomeVariant({ resultValue: result.result ?? null, naturalRoll }),
      title,
      naturalRoll,
      secondNaturalRoll,
      usedNaturalRoll: used,
      modifier: req.modifier,
      total,
      targetNumber: req.target_number,
      summary: inlineGenericSummary(total, req.target_number, naturalRoll),
      reviewPending: true,
      resolved: false,
    })
    setInlineRollMode('choice')
    setActionFlow('resolving_primary_roll')
    void loadMyRequests()
  }

  /** Dice icon: automatic roll with an in-menu animation. */
  async function rollInlineFromActionPage() {
    if (!activeRollRequest || activeRollRequest.status !== 'waiting_for_player') {
      setGuidedError('No roll request is waiting for you yet.')
      return
    }
    const req = activeRollRequest
    const hpEffect = rollRequestHpEffect(req)
    const needsSecond = req.advantage_state !== 'normal'
    setGuidedError(null)
    setInlineRollBusy(true)
    setInlineRollAnimating(true)
    void markRollRequestRolling(campaignId, req.id)
    const interval = window.setInterval(() => setInlineAnimNumber(randomD20()), 80)
    const naturalRoll = randomD20()
    const secondNaturalRoll = needsSecond ? randomD20() : null
    window.setTimeout(() => {
      window.clearInterval(interval)
      setInlineAnimNumber(hpEffect ? null : naturalRoll)
      void finishInlineRoll(req, 'automatic', naturalRoll, hpEffect ? null : secondNaturalRoll)
    }, 1020)
  }

  /** Manual roll: validate the entered d20 value(s), then submit. */
  async function submitInlineManualRoll() {
    if (!activeRollRequest || activeRollRequest.status !== 'waiting_for_player') {
      setGuidedError('No roll request is waiting for you yet.')
      return
    }
    const req = activeRollRequest
    const hpEffect = rollRequestHpEffect(req)
    const needsSecond = req.advantage_state !== 'normal'
    const one = Number(inlineManualOne)
    const two = needsSecond ? Number(inlineManualTwo) : null
    if (hpEffect) {
      if (!Number.isFinite(one) || one < 0) {
        setGuidedError('Enter the dice total for the healing or damage roll.')
        return
      }
      setGuidedError(null)
      setInlineRollBusy(true)
      void markRollRequestRolling(campaignId, req.id)
      await finishInlineRoll(req, 'manual', one, null)
      return
    }
    if (!Number.isInteger(one) || one < 1 || one > 20) {
      setGuidedError('Enter a natural d20 roll between 1 and 20.')
      return
    }
    if (needsSecond && (!Number.isInteger(two as number) || (two as number) < 1 || (two as number) > 20)) {
      setGuidedError('Enter the second d20 roll between 1 and 20.')
      return
    }
    setGuidedError(null)
    setInlineRollBusy(true)
    void markRollRequestRolling(campaignId, req.id)
    await finishInlineRoll(req, 'manual', one, two)
  }

  /** Attack damage step (when the server asks for a manual damage dice total). */
  async function submitInlineDamage() {
    if (!activeRollRequest || !inlinePendingDamage) return
    const total = Number(inlineDamageTotal)
    if (!Number.isFinite(total) || total < inlinePendingDamage.diceCount) {
      setGuidedError(`Enter a damage dice total of at least ${inlinePendingDamage.diceCount}.`)
      return
    }
    setGuidedError(null)
    setInlineRollBusy(true)
    const pending = inlinePendingDamage
    setInlinePendingDamage(null)
    await finishInlineRoll(
      activeRollRequest,
      'manual',
      pending.naturalRoll,
      pending.secondNaturalRoll,
      total,
    )
  }

  useEffect(() => {
    if (!guidedIntentId) return
    const intentId = guidedIntentId
    const supabase = createClient()

    function updateFlow(status: ActionIntentStatus, resolverStatus?: string | null) {
      if (status === 'denied') setActionFlow('denied')
      else if (status === 'cancelled') setActionFlow('cancelled')
      else if (status === 'resolved') setActionFlow('completed')
      else if (status === 'approved' && resolverStatus === 'pending_player') setActionFlow('resolving_primary_roll')
      else if (status === 'approved_waiting_for_roll' || status === 'rolling' || status === 'rolled_waiting_for_dm' || status === 'needs_roll' || status === 'resolving') {
        setActionFlow('resolving_primary_roll')
      } else if (status === 'approved') setActionFlow('approved')

      // Keep the shared outcome panel's "waiting for DM review" → "resolved"
      // state in sync without ever hiding the result the player rolled.
      const resolved = status === 'resolved' || status === 'denied' || status === 'cancelled'
      const reviewPending = status === 'rolled_waiting_for_dm' || status === 'resolving'
      setInlineOutcome((prev) =>
        prev ? { ...prev, reviewPending: reviewPending && !resolved, resolved } : prev,
      )
    }

    async function loadIntent() {
      const [{ data }, { data: rollRequest }, { data: rollResult }, { data: npcRevealResult }] = await Promise.all([
        supabase
        .from('action_intents')
        .select('*')
        .eq('id', intentId)
          .maybeSingle(),
        supabase
          .from('action_roll_requests')
          .select('*')
          .eq('action_intent_id', intentId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('action_roll_results')
          .select('*')
          .eq('action_intent_id', intentId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('action_results')
          .select('*')
          .eq('action_intent_id', intentId)
          .eq('result_type', 'npc_profile')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      if (!data) return
      const intent = data as ActionIntent
      const nextRollRequest = (rollRequest ?? null) as ActionRollRequest | null
      const revealResult = (npcRevealResult ?? null) as ActionResult | null
      setGuidedIntent(intent)
      setActiveRollRequest(nextRollRequest)
      setInlineRollResult((rollResult ?? null) as ActionRollResult | null)
      setNpcRevealPayload(isNpcRevealPayload(revealResult?.reveal_payload) ? revealResult.reveal_payload : null)

      // A fresh waiting roll request (first issue or a DM reroll) resets the
      // inline sub-flow once — never while the player is viewing a locked result.
      if (
        nextRollRequest &&
        nextRollRequest.status === 'waiting_for_player' &&
        handledRollRequestIdRef.current !== nextRollRequest.id
      ) {
        handledRollRequestIdRef.current = nextRollRequest.id
        setInlineRollMode('choice')
        setInlineManualOne('')
        setInlineManualTwo('')
        setInlinePendingDamage(null)
        setInlineDamageTotal('')
        setInlineAnimNumber(null)
        setInlineOutcome(null)
      }

      updateFlow(intent.status, intent.resolver_status)
    }

    const channel = supabase
      .channel(`guided-action-${intentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'action_intents',
          filter: `id=eq.${intentId}`,
        },
        (payload) => {
          const intent = payload.new as ActionIntent
          setGuidedIntent(intent)
          updateFlow(intent.status, intent.resolver_status)
          void loadIntent()
          void loadMyRequests()
        },
      )
      .subscribe()

    void loadIntent()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [guidedIntentId, loadMyRequests])

  useEffect(() => {
    if (!nudgeCooldownUntil) return
    const timer = window.setInterval(() => {
      if (Date.now() >= nudgeCooldownUntil) setNudgeCooldownUntil(null)
    }, 500)
    return () => window.clearInterval(timer)
  }, [nudgeCooldownUntil])

  async function sendMeeting() {
    setTalkBusy('meeting')
    setTalkFeedback(null)
    const result = await sendPartyMessage(campaignId, {
      messageType: 'meeting',
      message: 'Everyone should pause and listen.',
    })
    setTalkBusy(null)
    setTalkFeedback(result?.error ?? 'Party meeting called.')
  }

  async function sendAnnouncement() {
    setTalkBusy('announcement')
    setTalkFeedback(null)
    const result = await sendPartyMessage(campaignId, {
      messageType: 'announcement',
      message: partyMessage,
    })
    setTalkBusy(null)
    if (result?.error) {
      setTalkFeedback(result.error)
      return
    }
    setPartyMessage('')
    setTalkFeedback('Announcement sent.')
  }

  async function sendWhisper() {
    setTalkBusy('whisper')
    setTalkFeedback(null)
    const result = await sendPartyMessage(campaignId, {
      messageType: 'whisper',
      message: partyMessage,
      recipientUserId: whisperRecipient,
    })
    setTalkBusy(null)
    if (result?.error) {
      setTalkFeedback(result.error)
      return
    }
    setPartyMessage('')
    setTalkFeedback('Whisper sent.')
  }

  async function updateTravelMode(travelMode: TravelMode) {
    setTravelBusy('mode')
    setTravelFeedback(null)
    const result = await setMapTravelOptions(campaignId, map.id, { travelMode })
    setTravelBusy(null)
    if (result?.error) {
      setTravelFeedback(result.error)
      return
    }
    setMapState((prev) => ({ ...prev, travel_mode: travelMode }))
    setTravelFeedback('Travel mode updated.')
    router.refresh()
  }

  async function submitCreateParty() {
    setTravelBusy('create')
    setTravelFeedback(null)
    const result = await createTravelParty(campaignId, map.id, {
      name: partyName,
      leaderUserId: nominatedLeaderId,
      memberUserIds: selectedPartyMemberIds,
    })
    setTravelBusy(null)
    if (result?.error) {
      setTravelFeedback(result.error)
      return
    }
    setTravelFeedback('Party created. Invited players can respond, then the DM can approve it.')
    router.refresh()
  }

  async function respondToPartyInvite(partyId: string, accepted: boolean) {
    setTravelBusy(partyId)
    setTravelFeedback(null)
    const result = await respondTravelPartyInvite(campaignId, map.id, partyId, accepted)
    setTravelBusy(null)
    if (result?.error) {
      setTravelFeedback(result.error)
      return
    }
    setTravelFeedback(accepted ? 'Party invite accepted.' : 'Party invite denied.')
    router.refresh()
  }

  // Remaining movement for a controlled, linked token
  function remainingFor(t: Token): { used: number; speed: number } | null {
    if (!t.linked_character_id) return null
    const speed = characterSpeeds[t.linked_character_id]
    if (speed === undefined) return null
    return { used: Math.round(t.movement_used), speed }
  }

  function handleSelectToken(id: string | null) {
    setSelectedId(id)
    setInteractionOpen(false)
    setSection('root')
    if (!id) return
    // Token selection opens the lightweight card first. Actions only enter the
    // guided request flow after the player chooses a quick or advanced action.
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {mapState.travel_mode === 'group_party'
            ? `Group Party${mapState.group_movement_unlimited ? ' - infinite' : ' - 30 ft'}`
            : mapState.travel_mode === 'combat'
              ? 'Combat Mode'
              : `Freeroam${mapState.freeroam_movement_unlimited ? ' - infinite' : ' - 30 ft'}`}
        </span>
        {mapState.party_options_locked && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-orange-500/30 bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-300">
            Party options locked
          </span>
        )}
        {mapLocked ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-500/15 text-orange-300 border border-orange-500/30 text-xs font-medium">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Movement locked by DM
          </span>
        ) : myControlled.length > 0 ? (
          <span className="text-xs text-zinc-500">
            Drag your token to move it.
          </span>
        ) : (
          <span className="text-xs text-zinc-600">
            You have no token to control on this map yet.
          </span>
        )}

        {/* Remaining movement for controlled, linked tokens */}
        {!mapLocked &&
          myControlled.map((t) => {
            const r = remainingFor(t)
            if (!r) return null
            const left = Math.max(0, r.speed - r.used)
            return (
              <span key={t.id} className="text-xs text-zinc-400">
                <span className="text-zinc-200 font-medium">{t.name || 'Your token'}</span>
                : {left} / {r.speed} ft left
              </span>
            )
          })}
      </div>

      {warning && (
        <div className="rounded-lg border border-orange-800/60 bg-orange-900/30 text-orange-200 px-4 py-2.5 text-sm">
          {warning}
        </div>
      )}

      <div className="h-[60vh] lg:h-[calc(100vh-220px)] min-h-80 relative">
        <MapCanvas
          imageUrl={imageUrl}
          width={map.width}
          height={map.height}
          gridEnabled={map.grid_enabled}
          gridSize={map.grid_size}
          gridColor={map.grid_color}
          gridOpacity={map.grid_opacity}
          gridLineWidth={map.grid_line_width}
          gridSubdivisions={map.grid_subdivisions}
          gridOffsetX={map.grid_offset_x}
          gridOffsetY={map.grid_offset_y}
          tokens={renderTokens}
          mode="player"
          selectedTokenId={selectedId}
          onSelectToken={handleSelectToken}
          onMoveToken={handleMove}
          canDragToken={canDrag}
          revealedAreas={renderAreas}
          fogEnabled
        />

        {areas.length === 0 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-zinc-900/95 border border-zinc-700 rounded-lg px-3.5 py-2 text-xs text-zinc-400 shadow-lg">
            The DM has not revealed this map yet.
          </div>
        )}

        {selected && !isTransport && (
          <div className="absolute bottom-16 left-3 right-3 z-10 max-w-sm bg-zinc-900/95 border border-zinc-700 rounded-lg p-3 shadow-lg sm:right-auto">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-4 h-4 rounded-full border border-black/40 shrink-0"
                  style={{ backgroundColor: selected.color }}
                />
                <span className="text-sm font-medium text-zinc-100 truncate">
                  {selectedHiddenHint ? 'Something is here' : selected.name || 'Token'}
                </span>
                {controls(selected) && (
                  <span className="text-xs text-emerald-400 shrink-0">Yours</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="shrink-0 text-zinc-500 hover:text-zinc-300"
                aria-label="Close token details"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {selectedHiddenHint ? (
              <p className="mt-3 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
                You can make out a presence or object here, but it has not been fully discovered yet.
              </p>
            ) : selected.public_description && (
              <p className="text-xs text-zinc-300 mt-1.5">{selected.public_description}</p>
            )}
            {!selectedHiddenHint && selected.notes && (
              <p className="text-xs text-zinc-400 mt-1.5">{selected.notes}</p>
            )}
            {!selectedHiddenHint && selected.object_state && selected.object_state !== 'visible' && (
              <p className="text-[11px] text-amber-400/80 mt-1 capitalize">
                State: {selected.object_state}
              </p>
            )}

            {!selectedHiddenHint && (
              <PlayerLinkedCodexDocsPanel
                objectType={codexObjectTypeForToken(selected)}
                objectId={selected.id}
                docs={playerCodexDocs}
                links={playerCodexLinks}
              />
            )}

            {/* Contextual action menu — only the actions the DM allowed */}
            {!selectedHiddenHint && !isTransport && contextualActions.length > 0 && (
              <div className="mt-3 border-t border-zinc-800 pt-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-600 mb-2">
                  {nearestActor
                    ? `${nearestActor.distance} ft away — choose an action`
                    : 'Link a character to a token to act'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {contextualActions.map((action) => {
                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => startActionDraft(action, selected.id)}
                        className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-amber-500/60 hover:text-amber-200 disabled:opacity-40 disabled:hover:border-zinc-700 disabled:hover:text-zinc-200"
                      >
                        {action}
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => openGuidedAction(selected.id)}
                  className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-400 hover:bg-amber-500/20 disabled:opacity-40"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  More actions
                </button>
              </div>
            )}
          </div>
        )}

        {/* Portal token — dedicated travel popup */}
        {selected && isTransport && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setSelectedId(null)}
          >
            <div
              className="w-full max-w-xs rounded-2xl border border-violet-500/40 bg-zinc-950 p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-500/40 bg-violet-500/15 text-lg">🌀</span>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-violet-300/80">
                      {selectedHiddenHint ? 'Unrevealed portal' : 'Travel'}
                    </p>
                    <p className="truncate text-base font-semibold text-zinc-100">
                      {selectedHiddenHint ? 'Something is here' : selected.name || 'New location'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="shrink-0 rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedHiddenHint ? (
                <p className="mt-3 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
                  You can tell there is something here, but it has not been fully discovered yet.
                </p>
              ) : selected.public_description && (
                <p className="mt-3 text-sm text-zinc-300">{selected.public_description}</p>
              )}

              {selectedHiddenHint ? (
                <p className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
                  Move closer or wait for the DM to reveal this area before traveling.
                </p>
              ) : mapState.travel_mode === 'combat' ? (
                <p className="mt-4 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-300">
                  Travel is locked during combat.
                </p>
              ) : (
                <>
                  {transportNeedsVote && (
                    <p className="mt-4 text-xs text-zinc-400">
                      Everyone must agree to travel — {transportTally.confirmed}/{transportVoters.size} confirmed
                      {transportTally.mine ? ' (you voted)' : ''}.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={transportBusy}
                    onClick={handleTransportTravel}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/60 bg-violet-500/20 px-4 py-2.5 text-sm font-semibold text-violet-50 transition hover:border-violet-400 hover:bg-violet-500/30 disabled:opacity-50"
                  >
                    🌀 {transportBusy
                      ? 'Working…'
                      : transportNeedsVote
                        ? transportTally.mine
                          ? 'Change vote to here'
                          : 'Vote to go here'
                        : `Go to ${selected.name || 'this location'}`}
                  </button>
                  {transportFeedback && (
                    <p className="mt-2 text-center text-xs text-violet-300">{transportFeedback}</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="absolute bottom-3 left-3 z-30">
          <button
            type="button"
            onClick={() => {
              setInteractionOpen((open) => !open)
              setSection('root')
            }}
            aria-label="Open interaction menu"
            className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-xl backdrop-blur transition active:scale-95 ${
              interactionOpen
                ? 'border-amber-400 bg-amber-500 text-zinc-950'
                : 'border-zinc-700 bg-zinc-950/90 text-amber-200 hover:border-amber-500/70 hover:bg-zinc-900'
            }`}
          >
            <Hand className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {interactionOpen && (
          <InteractionMenu
            section={section}
            setSection={setSection}
            onClose={() => setInteractionOpen(false)}
            selected={selected}
            contextualActions={contextualActions}
            nearestActor={nearestActor}
            onStartAction={startActionDraft}
            myRequests={myRequests}
            requestsLoading={requestsLoading}
            partyMembers={partyMembers.filter((member) => member.userId !== currentUserId)}
            partyMessage={partyMessage}
            setPartyMessage={setPartyMessage}
            whisperRecipient={whisperRecipient}
            setWhisperRecipient={setWhisperRecipient}
            talkFeedback={talkFeedback}
            talkBusy={talkBusy}
            map={mapState}
            currentUserId={currentUserId}
            travelParties={travelParties}
            travelPartyMembers={travelPartyMembers}
            partyName={partyName}
            setPartyName={setPartyName}
            nominatedLeaderId={nominatedLeaderId}
            setNominatedLeaderId={setNominatedLeaderId}
            selectedPartyMemberIds={selectedPartyMemberIds}
            setSelectedPartyMemberIds={setSelectedPartyMemberIds}
            travelFeedback={travelFeedback}
            travelBusy={travelBusy}
            updateTravelMode={updateTravelMode}
            submitCreateParty={submitCreateParty}
            respondToPartyInvite={respondToPartyInvite}
            sendMeeting={sendMeeting}
            sendAnnouncement={sendAnnouncement}
            sendWhisper={sendWhisper}
            onTakeAction={() => openGuidedAction(selected?.id ?? null)}
          />
        )}

        {actionFlow !== 'idle' && (
          <ActionSequenceOverlay
            state={actionFlow}
            target={actionTarget}
            targets={visibleTargets}
            actor={actorForActionTarget}
            actionType={guidedActionType}
            setActionType={(value) => {
              setGuidedActionType(value)
              setSelectedToolId('')
            }}
            selectedTool={selectedTool}
            selectedToolId={selectedToolId}
            toolOptions={toolOptions}
            toolsLoading={toolsLoading}
            setSelectedToolId={setSelectedToolId}
            message={guidedActionMessage}
            setMessage={setGuidedActionMessage}
            intent={guidedIntent}
            npcReveal={npcRevealPayload}
            rollRequest={activeRollRequest}
            rollResult={inlineRollResult}
            inlineRollBusy={inlineRollBusy}
            inlineRollAnimating={inlineRollAnimating}
            inlineRollMode={inlineRollMode}
            inlineManualOne={inlineManualOne}
            inlineManualTwo={inlineManualTwo}
            setInlineManualOne={setInlineManualOne}
            setInlineManualTwo={setInlineManualTwo}
            inlineAnimNumber={inlineAnimNumber}
            inlinePendingDamage={inlinePendingDamage}
            inlineDamageTotal={inlineDamageTotal}
            setInlineDamageTotal={setInlineDamageTotal}
            inlineOutcome={inlineOutcome}
            onInlineManualToggle={() => {
              setGuidedError(null)
              setInlineRollMode((mode) => (mode === 'manual' ? 'choice' : 'manual'))
            }}
            onInlineManualSubmit={submitInlineManualRoll}
            onInlineDamageSubmit={submitInlineDamage}
            error={guidedError}
            nudgeBusy={nudgeBusy}
            nudgeCooldownUntil={nudgeCooldownUntil}
            setTargetId={(id) => {
              setActionTargetId(id)
              setSelectedId(id)
              setSelectedToolId('')
            }}
            onSubmit={submitGuidedAction}
            onNudge={nudgeDM}
            onInlineRoll={rollInlineFromActionPage}
            onBack={() => setActionFlow('choosing_action')}
            onClose={closeGuidedAction}
          />
        )}
      </div>

      <p className="text-xs text-zinc-600 text-center">
        Drag to pan · scroll or use the buttons to zoom · 1 square = {map.grid_scale_feet} ft
      </p>

    </div>
  )
}

function requestStatusLabel(status: string) {
  return status.replace(/_/g, ' ')
}

function MenuItem({
  title,
  description,
  icon,
  onClick,
  onMouseEnter,
  active,
  disabled,
  trailing = true,
}: {
  title: string
  description: string
  icon: React.ReactNode
  onClick?: () => void
  onMouseEnter?: () => void
  active?: boolean
  disabled?: boolean
  trailing?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? 'border-amber-500/60 bg-amber-500/10'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/70'
      }`}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-amber-200">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-100">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{description}</span>
      </span>
      {trailing && <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />}
    </button>
  )
}

function InteractionMenu({
  section,
  setSection,
  onClose,
  selected,
  contextualActions,
  nearestActor,
  onStartAction,
  myRequests,
  requestsLoading,
  partyMembers,
  partyMessage,
  setPartyMessage,
  whisperRecipient,
  setWhisperRecipient,
  talkFeedback,
  talkBusy,
  map,
  currentUserId,
  travelParties,
  travelPartyMembers,
  partyName,
  setPartyName,
  nominatedLeaderId,
  setNominatedLeaderId,
  selectedPartyMemberIds,
  setSelectedPartyMemberIds,
  travelFeedback,
  travelBusy,
  updateTravelMode,
  submitCreateParty,
  respondToPartyInvite,
  sendMeeting,
  sendAnnouncement,
  sendWhisper,
  onTakeAction,
}: {
  section: InteractionSection
  setSection: (section: InteractionSection) => void
  onClose: () => void
  selected: Token | null
  contextualActions: string[]
  nearestActor: { actor: Token; distance: number } | null
  onStartAction: (actionType: string, targetId?: string | null) => void
  myRequests: ActionIntent[]
  requestsLoading: boolean
  partyMembers: { userId: string; role: string; profile: Profile | null }[]
  partyMessage: string
  setPartyMessage: (value: string) => void
  whisperRecipient: string
  setWhisperRecipient: (value: string) => void
  talkFeedback: string | null
  talkBusy: string | null
  map: GameMap
  currentUserId: string
  travelParties: MapTravelParty[]
  travelPartyMembers: MapTravelPartyMember[]
  partyName: string
  setPartyName: (value: string) => void
  nominatedLeaderId: string
  setNominatedLeaderId: (value: string) => void
  selectedPartyMemberIds: string[]
  setSelectedPartyMemberIds: (value: string[]) => void
  travelFeedback: string | null
  travelBusy: string | null
  updateTravelMode: (travelMode: TravelMode) => void
  submitCreateParty: () => void
  respondToPartyInvite: (partyId: string, accepted: boolean) => void
  sendMeeting: () => void
  sendAnnouncement: () => void
  sendWhisper: () => void
  onTakeAction: () => void
}) {
  const actionPanel = (
    <div className="grid gap-2">
      <MenuItem
        title="Take an Action"
        description="Open the guided action request flow for DM review."
        icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
        onClick={onTakeAction}
        trailing={false}
      />
      <MenuItem
        title="Requests"
        description="Open your action requests and draft selected-token actions."
        icon={<Hand className="h-4 w-4" aria-hidden="true" />}
        onClick={() => setSection('requests')}
        trailing={false}
      />
    </div>
  )

  const talkPanel = (
    <div className="grid gap-2">
      <MenuItem
        title="Call Party Meeting"
        description="Send a loud meeting alert to every player."
        icon={<Users className="h-4 w-4" aria-hidden="true" />}
        onClick={sendMeeting}
        disabled={talkBusy === 'meeting'}
        trailing={false}
      />
      <MenuItem
        title="Whisper to Party Member"
        description="Send a private message to one party member."
        icon={<MessageCircle className="h-4 w-4" aria-hidden="true" />}
        onClick={() => setSection('whisper')}
        trailing={false}
      />
      <MenuItem
        title="Make Party Announcement"
        description="Send a visible message to the whole party."
        icon={<Megaphone className="h-4 w-4" aria-hidden="true" />}
        onClick={() => setSection('announcement')}
        trailing={false}
      />
      {talkFeedback && <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-amber-200">{talkFeedback}</p>}
    </div>
  )

  const allPlayerOptions = [
    { userId: currentUserId, name: 'You' },
    ...partyMembers
      .filter((member) => member.role !== 'dm')
      .map((member) => ({
        userId: member.userId,
        name: member.profile?.display_name ?? 'Party member',
      })),
  ]
  const playerName = (userId: string) =>
    allPlayerOptions.find((player) => player.userId === userId)?.name ?? 'Player'
  const myInviteRows = travelPartyMembers.filter(
    (member) => member.user_id === currentUserId && member.status === 'pending',
  )
  const activeParty = travelParties.find((party) => party.status === 'approved')
  const myParties = travelParties.filter((party) =>
    travelPartyMembers.some((member) => member.party_id === party.id && member.user_id === currentUserId),
  )

  function togglePartyMember(userId: string) {
    if (userId === currentUserId) return
    const next = selectedPartyMemberIds.includes(userId)
      ? selectedPartyMemberIds.filter((id) => id !== userId)
      : [...selectedPartyMemberIds, userId]
    setSelectedPartyMemberIds(Array.from(new Set([currentUserId, ...next])))
  }

  const travelPanel = (
    <div className="grid gap-3">
      <div>
        <p className="text-sm font-semibold text-zinc-100">Travel Options</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          1 square is 5 ft. Standard travel movement is 30 ft unless the DM allows infinite movement.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Current mode</p>
            <p className="mt-1 text-sm font-medium text-zinc-100">
              {map.travel_mode === 'group_party'
                ? 'Group Party'
                : map.travel_mode === 'combat'
                  ? 'Combat Mode'
                  : 'Freeroam'}
            </p>
          </div>
          <span className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-400">
            {map.travel_mode === 'group_party'
              ? map.group_movement_unlimited ? 'Infinite' : '30 ft'
              : map.travel_mode === 'freeroam'
                ? map.freeroam_movement_unlimited ? 'Infinite' : '30 ft'
                : 'Locked'}
          </span>
        </div>

        {map.party_options_locked ? (
          <p className="mt-3 rounded-md border border-orange-800/60 bg-orange-950/30 px-3 py-2 text-xs text-orange-200">
            The DM has locked party options.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={travelBusy === 'mode'}
              onClick={() => updateTravelMode('group_party')}
              className={`rounded-md border px-3 py-2 text-xs font-semibold transition disabled:opacity-45 ${
                map.travel_mode === 'group_party'
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-100'
                  : 'border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-zinc-500'
              }`}
            >
              Group Party
            </button>
            <button
              type="button"
              disabled={travelBusy === 'mode'}
              onClick={() => updateTravelMode('freeroam')}
              className={`rounded-md border px-3 py-2 text-xs font-semibold transition disabled:opacity-45 ${
                map.travel_mode === 'freeroam'
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-100'
                  : 'border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-zinc-500'
              }`}
            >
              Freeroam
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Create Party</p>
        <label className="mt-3 block text-xs text-zinc-400">
          Party name
          <input
            value={partyName}
            onChange={(event) => setPartyName(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
          />
        </label>
        <label className="mt-3 block text-xs text-zinc-400">
          Nominated leader
          <select
            value={nominatedLeaderId}
            onChange={(event) => setNominatedLeaderId(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
          >
            {allPlayerOptions.map((player) => (
              <option key={player.userId} value={player.userId}>{player.name}</option>
            ))}
          </select>
        </label>
        <div className="mt-3 grid gap-1.5">
          {allPlayerOptions.map((player) => (
            <label key={player.userId} className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
              <span>{player.name}</span>
              <input
                type="checkbox"
                checked={selectedPartyMemberIds.includes(player.userId)}
                disabled={player.userId === currentUserId}
                onChange={() => togglePartyMember(player.userId)}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={travelBusy === 'create' || selectedPartyMemberIds.length === 0}
          onClick={submitCreateParty}
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-45"
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          {travelBusy === 'create' ? 'Creating...' : 'Create Party'}
        </button>
      </div>

      {(myInviteRows.length > 0 || myParties.length > 0) && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Party status</p>
          {activeParty && (
            <p className="mt-2 text-xs text-emerald-300">
              Active party: {activeParty.name}, led by {playerName(activeParty.leader_user_id)}
            </p>
          )}
          <div className="mt-2 grid gap-2">
            {myInviteRows.map((invite) => {
              const party = travelParties.find((item) => item.id === invite.party_id)
              if (!party) return null
              return (
                <div key={invite.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
                  <p className="text-xs font-medium text-zinc-100">{party.name}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Leader: {playerName(party.leader_user_id)}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={travelBusy === party.id}
                      onClick={() => respondToPartyInvite(party.id, false)}
                      className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-45"
                    >
                      Deny
                    </button>
                    <button
                      type="button"
                      disabled={travelBusy === party.id}
                      onClick={() => respondToPartyInvite(party.id, true)}
                      className="flex-1 rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-zinc-950 disabled:opacity-45"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              )
            })}
            {myParties.map((party) => (
              <div key={party.id} className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-100">{party.name}</p>
                  <span className="rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] capitalize text-zinc-400">
                    {party.status.replace(/_/g, ' ')}
                  </span>
                </div>
                {party.dm_response && <p className="mt-1 text-xs text-amber-200">DM: {party.dm_response}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {travelFeedback && (
        <p className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-amber-200">
          {travelFeedback}
        </p>
      )}
    </div>
  )

  const requestsPanel = (
    <div className="grid gap-3">
      <div>
        <p className="text-sm font-semibold text-zinc-100">Requests</p>
        <p className="mt-0.5 text-xs text-zinc-500">View your current requests and submit quick actions to the DM.</p>
      </div>
      {selected && contextualActions.length > 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-xs font-medium text-zinc-300">Selected: {selected.name || selected.token_type}</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {nearestActor ? `${nearestActor.distance} ft away` : 'Link a character to a token to act.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {contextualActions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => onStartAction(action, selected.id)}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:border-amber-500/60 hover:text-amber-200 disabled:opacity-45"
              >
                {action}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Choosing an action opens the request card before anything is sent to the DM.
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-500">
          Select an interactable token on the map to submit a quick action request.
        </p>
      )}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">My Requests</p>
        <div className="mt-2 grid gap-2">
          {requestsLoading ? (
            <p className="text-xs text-zinc-500">Loading requests...</p>
          ) : myRequests.length === 0 ? (
            <p className="text-xs text-zinc-500">No action requests yet.</p>
          ) : (
            myRequests.map((request) => (
              <div key={request.id} className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-100">{request.action_type}</p>
                  <span className="rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] capitalize text-zinc-400">
                    {requestStatusLabel(request.status)}
                  </span>
                </div>
                {request.dm_response && <p className="mt-1 text-xs text-amber-200">DM: {request.dm_response}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )

  const announcementPanel = (
    <MessageForm
      title="Make Party Announcement"
      description="Send a visible message to the whole party."
      value={partyMessage}
      setValue={setPartyMessage}
      busy={talkBusy === 'announcement'}
      buttonLabel="Send Announcement"
      onSubmit={sendAnnouncement}
      feedback={talkFeedback}
    />
  )

  const whisperPanel = (
    <div className="grid gap-3">
      <div>
        <p className="text-sm font-semibold text-zinc-100">Whisper to Party Member</p>
        <p className="mt-0.5 text-xs text-zinc-500">Send a private message to one party member.</p>
      </div>
      {partyMembers.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-500">
          No other party members are available right now.
        </p>
      ) : (
        <>
          <select
            value={whisperRecipient}
            onChange={(event) => setWhisperRecipient(event.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
          >
            <option value="">Choose a party member</option>
            {partyMembers.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.profile?.display_name ?? 'Party member'}{member.role === 'dm' ? ' (DM)' : ''}
              </option>
            ))}
          </select>
          <MessageForm
            title=""
            description=""
            value={partyMessage}
            setValue={setPartyMessage}
            busy={talkBusy === 'whisper'}
            buttonLabel="Send Whisper"
            onSubmit={sendWhisper}
            feedback={talkFeedback}
          />
        </>
      )}
    </div>
  )

  const detailPanel =
    section === 'action' ? actionPanel :
    section === 'requests' ? requestsPanel :
    section === 'talk' ? talkPanel :
    section === 'travel' ? travelPanel :
    section === 'whisper' ? whisperPanel :
    section === 'announcement' ? announcementPanel :
    null

  return (
    <>
      <button
        type="button"
        aria-label="Close interaction menu"
        onClick={onClose}
        className="absolute inset-0 z-20 bg-black/10"
      />

      <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-3 backdrop-blur-sm md:hidden">
        <div className="max-h-[82vh] w-full overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => section === 'root' ? onClose() : setSection('root')}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            >
              {section === 'root' ? <X className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
              {section === 'root' ? 'Close' : 'Back'}
            </button>
            <p className="text-sm font-semibold text-zinc-100">Interaction Menu</p>
          </div>
          {section === 'root' ? (
            <div className="grid gap-2">
              <MenuItem title="Action" description="Request actions, rolls, and DM review." icon={<Hand className="h-4 w-4" />} onClick={() => setSection('action')} />
              <MenuItem title="Talk" description="Communicate with the party." icon={<MessageCircle className="h-4 w-4" />} onClick={() => setSection('talk')} />
              <MenuItem title="Travel Options" description="Create a party and choose travel mode." icon={<Users className="h-4 w-4" />} onClick={() => setSection('travel')} />
            </div>
          ) : detailPanel}
        </div>
      </div>

      <div className="absolute bottom-16 left-3 z-40 hidden md:flex items-start gap-2">
        <div className="w-80 rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-2xl shadow-black/50">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-zinc-100">Interaction Menu</p>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100" aria-label="Close interaction menu">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-2">
            <MenuItem title="Action" description="Request actions, rolls, and DM review." icon={<Hand className="h-4 w-4" />} active={section === 'action' || section === 'requests'} onMouseEnter={() => setSection('action')} onClick={() => setSection('action')} />
            <MenuItem title="Talk" description="Communicate with the party." icon={<MessageCircle className="h-4 w-4" />} active={section === 'talk' || section === 'whisper' || section === 'announcement'} onMouseEnter={() => setSection('talk')} onClick={() => setSection('talk')} />
            <MenuItem title="Travel Options" description="Create a party and choose travel mode." icon={<Users className="h-4 w-4" />} active={section === 'travel'} onMouseEnter={() => setSection('travel')} onClick={() => setSection('travel')} />
          </div>
        </div>
        {detailPanel && (
          <div className="max-h-[70vh] w-[28rem] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-2xl shadow-black/50">
            {detailPanel}
          </div>
        )}
      </div>
    </>
  )
}

function ActionSequenceOverlay({
  state,
  target,
  targets,
  actor,
  actionType,
  setActionType,
  selectedTool,
  selectedToolId,
  toolOptions,
  toolsLoading,
  setSelectedToolId,
  message,
  setMessage,
  intent,
  npcReveal,
  rollRequest,
  rollResult,
  inlineRollBusy,
  inlineRollAnimating,
  inlineRollMode,
  inlineManualOne,
  inlineManualTwo,
  setInlineManualOne,
  setInlineManualTwo,
  inlineAnimNumber,
  inlinePendingDamage,
  inlineDamageTotal,
  setInlineDamageTotal,
  inlineOutcome,
  onInlineManualToggle,
  onInlineManualSubmit,
  onInlineDamageSubmit,
  error,
  nudgeBusy,
  nudgeCooldownUntil,
  setTargetId,
  onSubmit,
  onNudge,
  onInlineRoll,
  onBack,
  onClose,
}: {
  state: ActionSequenceState
  target: Token | null
  targets: Token[]
  actor: { actor: Token; distance: number } | null
  actionType: GuidedActionType
  setActionType: (value: GuidedActionType) => void
  selectedTool: ActionToolOption | null
  selectedToolId: string
  toolOptions: ActionToolOption[]
  toolsLoading: boolean
  setSelectedToolId: (value: string) => void
  message: string
  setMessage: (value: string) => void
  intent: ActionIntent | null
  npcReveal: NpcRevealPayload | null
  rollRequest: ActionRollRequest | null
  rollResult: ActionRollResult | null
  inlineRollBusy: boolean
  inlineRollAnimating: boolean
  inlineRollMode: 'choice' | 'manual' | 'damage'
  inlineManualOne: string
  inlineManualTwo: string
  setInlineManualOne: (value: string) => void
  setInlineManualTwo: (value: string) => void
  inlineAnimNumber: number | null
  inlinePendingDamage: {
    formula: string
    diceCount: number
    dieSize: number
    critical: boolean
    naturalRoll: number
    secondNaturalRoll: number | null
  } | null
  inlineDamageTotal: string
  setInlineDamageTotal: (value: string) => void
  inlineOutcome: PlayerRollOutcomeData | null
  onInlineManualToggle: () => void
  onInlineManualSubmit: () => void
  onInlineDamageSubmit: () => void
  error: string | null
  nudgeBusy: boolean
  nudgeCooldownUntil: number | null
  setTargetId: (id: string) => void
  onSubmit: () => void
  onNudge: () => void
  onInlineRoll: () => void
  onBack: () => void
  onClose: () => void
}) {
  const isChoosing = state === 'token_selected' || state === 'choosing_action' || state === 'submitting_request'
  const isAwaiting = state === 'awaiting_dm'
  const isApproved = state === 'approved'
  const isDenied = state === 'denied'
  const isRollState = state === 'resolving_primary_roll' || state === 'resolving_secondary_roll'
  const isCompleted = state === 'completed'
  const isCancelled = state === 'cancelled'
  const showRollStep = isRollState || (isApproved && intent?.resolver_status === 'pending_player')
  const isNudgeCoolingDown = Boolean(nudgeCooldownUntil)
  const selectedAction = GUIDED_ACTION_TYPES.find((item) => item.type === actionType) ?? {
    type: actionType,
    label: actionType,
    description: 'Describe exactly what you want the DM to adjudicate.',
    icon: <ScrollText className="h-4 w-4" aria-hidden="true" />,
    tone: 'border-zinc-600 bg-zinc-900 text-zinc-100',
  }
  const toolCopy = toolCopyForAction(actionType)
  const targetName = target?.name || target?.token_type || null
  const actionSummary = actionToolPhrase(actionType, targetName, selectedTool?.name ?? intent?.selected_tool_name)
  const rangeFeet = target?.interaction_range_feet ?? (isGuidedPlayerAction(actionType) ? 60 : 5)
  const outOfRange = Boolean(actor && target && actor.distance > rangeFeet)
  const shortcutActionSelected = !isGuidedPlayerAction(actionType)
  const activeActionCardClass =
    'relative overflow-hidden border-transparent bg-zinc-950 text-zinc-50 shadow-[0_0_24px_rgba(56,189,248,0.28)] ring-2 ring-fuchsia-400/40'
  const inactiveActionCardClass = 'border-zinc-800 bg-zinc-900 text-zinc-300'
  const activeActionGlow = (
    <>
      <span
        className="pointer-events-none absolute -inset-12 animate-spin bg-[conic-gradient(from_0deg,rgba(236,72,153,0),rgba(236,72,153,0.65),rgba(56,189,248,0.7),rgba(236,72,153,0))] opacity-60 motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="pointer-events-none absolute inset-[1px] rounded-[7px] bg-zinc-950/95" aria-hidden="true" />
    </>
  )

  const steps = [
    { key: 'choose', label: 'Choose Action', icon: <MousePointer2 className="h-4 w-4" />, active: isChoosing, done: !isChoosing },
    { key: 'await', label: 'Await DM', icon: <Mail className="h-4 w-4" />, active: isAwaiting, done: isApproved || isDenied || isRollState || isCompleted || isCancelled },
    { key: 'response', label: 'DM Response', icon: isDenied ? <CircleX className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />, active: isApproved || isDenied || isCompleted || isCancelled, done: isRollState || isCompleted },
    ...(showRollStep || isRollState || isCompleted
      ? [{ key: 'roll', label: 'Resolve Action', icon: <Dices className="h-4 w-4" />, active: isRollState, done: isCompleted }]
      : []),
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/65 p-2 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/60 transition-all duration-200 motion-reduce:transition-none sm:max-h-[calc(100vh-2rem)]">
        <div className="shrink-0 flex items-start justify-between gap-3 border-b border-zinc-800 bg-zinc-900/80 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300 sm:text-xs sm:tracking-[0.22em]">Player Action Request</p>
            <h2 className="mt-1 text-xl font-bold text-zinc-50 sm:text-2xl">Resolve it at the table</h2>
            <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
              {target ? `${target.name || target.token_type} is selected.` : 'Choose a visible map target.'}
            </p>
            {isChoosing && target && (
              <button
                type="button"
                onClick={onClose}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-amber-500/60 hover:text-amber-100"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back to token menu
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-3 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Close action request"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 gap-4 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {steps.map((step) => (
              <div
                key={step.key}
                className={`rounded-lg border px-2.5 py-2 transition sm:px-3 ${
                  step.active
                    ? 'border-amber-400 bg-amber-500/10 text-amber-100'
                    : step.done
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-500'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md border ${
                    step.active ? 'border-amber-400/60 bg-amber-400/10' : 'border-zinc-700 bg-zinc-950'
                  }`}>
                    {step.icon}
                  </span>
                  <span className="text-[11px] font-semibold sm:text-xs">{step.label}</span>
                </div>
              </div>
            ))}
          </div>

          {isChoosing && (
            <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500" htmlFor="guided-target">
                  Target
                </label>
                <select
                  id="guided-target"
                  value={target?.id ?? ''}
                  onChange={(event) => setTargetId(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-base text-zinc-100 outline-none focus:border-amber-500 sm:text-sm"
                >
                  <option value="" disabled>Choose target</option>
                  {targets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.token_type}
                    </option>
                  ))}
                </select>
                <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <p className="text-xs font-medium text-zinc-300">{actor?.actor.name ?? 'No actor in range'}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {actor
                      ? `${actor.distance} ft from target; range ${rangeFeet} ft`
                      : 'Link one of your character tokens to act.'}
                  </p>
                  {outOfRange && (
                    <p className="mt-2 rounded-md border border-red-800 bg-red-950/50 px-2 py-1.5 text-[11px] text-red-200">
                      Too far away. Move within {rangeFeet} ft before sending this action.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4">
                {shortcutActionSelected && (
                  <div className="relative overflow-hidden rounded-lg border border-transparent bg-zinc-950 p-[1px] shadow-[0_0_24px_rgba(56,189,248,0.28)] ring-2 ring-fuchsia-400/40">
                    {activeActionGlow}
                    <div className="relative z-10 rounded-[7px] bg-zinc-950/95 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200">Selected shortcut</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`flex h-8 w-8 items-center justify-center rounded-md border ${selectedAction.tone}`}>
                          {selectedAction.icon}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-zinc-50">{selectedAction.label}</p>
                          <p className="text-xs text-zinc-400">This quick-menu action is active for the request below.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {GUIDED_ACTION_TYPES.map((item) => {
                    const active = actionType === item.type
                    return (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => setActionType(item.type)}
                        className={`relative min-h-24 overflow-hidden rounded-lg border p-3 text-left transition hover:border-amber-400/60 ${
                          active ? activeActionCardClass : inactiveActionCardClass
                        }`}
                      >
                        {active && activeActionGlow}
                        <span className="relative z-10 flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-current/25 bg-black/20">
                            {item.icon}
                          </span>
                          <span className="text-sm font-semibold">{item.label}</span>
                        </span>
                        <span className="relative z-10 mt-2 block text-xs leading-relaxed opacity-75">{item.description}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="relative overflow-hidden rounded-xl border border-transparent bg-zinc-950 p-[1px] shadow-[0_0_20px_rgba(236,72,153,0.16)]">
                  {activeActionGlow}
                  <div className="relative z-10 rounded-[11px] bg-zinc-900 p-4">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-md border ${selectedAction.tone}`}>
                        {selectedAction.icon}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-zinc-100">{selectedAction.label}</p>
                        <p className="text-xs text-zinc-500">{selectedAction.description}</p>
                      </div>
                    </div>
                    <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-zinc-500" htmlFor="guided-tool">
                      {toolCopy.label}
                    </label>
                    <select
                      id="guided-tool"
                      value={selectedToolId}
                      onChange={(event) => setSelectedToolId(event.target.value)}
                      className="mt-2 min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-base text-zinc-100 outline-none focus:border-amber-500 sm:text-sm"
                    >
                      {toolsLoading && <option value="">Loading choices...</option>}
                      {!toolsLoading && toolOptions.length === 0 && <option value="">No choices available</option>}
                      {!toolsLoading && toolOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name} ({option.source})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-zinc-500">{toolCopy.placeholder}</p>
                    {selectedTool?.note && <p className="mt-1 text-[11px] text-amber-200">{selectedTool.note}</p>}
                    <textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      rows={3}
                      maxLength={500}
                      placeholder="Describe what you are trying to do."
                      className="mt-3 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-base text-zinc-100 outline-none focus:border-amber-500 sm:text-sm"
                    />
                    <p className="mt-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
                      Request: <span className="font-medium text-zinc-100">{actionSummary}</span>
                    </p>
                    {error && <p className="mt-2 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-200">{error}</p>}
                    <button
                      type="button"
                      disabled={!target || !actor || outOfRange || state === 'submitting_request'}
                      onClick={onSubmit}
                      className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-45 sm:w-auto"
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      {state === 'submitting_request' ? 'Sending...' : 'Send to DM'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isAwaiting && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
              <Mail className="mx-auto h-12 w-12 animate-pulse text-amber-300" aria-hidden="true" />
              <h3 className="mt-3 text-xl font-bold text-amber-50">Waiting for the DM</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-amber-100/80">
                {actionSummary} request sent. Keep the outcome visible here while the DM reviews it.
              </p>
              <button
                type="button"
                disabled={nudgeBusy || isNudgeCoolingDown}
                onClick={onNudge}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-md border border-amber-400/50 bg-zinc-950 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-300 disabled:opacity-45"
              >
                <Hourglass className="h-4 w-4" aria-hidden="true" />
                {nudgeBusy ? 'Nudging...' : isNudgeCoolingDown ? 'Nudge sent' : 'Nudge DM'}
              </button>
              {error && <p className="mt-3 text-xs text-red-200">{error}</p>}
            </div>
          )}

          {(isApproved || isDenied || isCompleted || isCancelled) && (
            <div className={`rounded-xl border p-6 text-center ${
              isDenied || isCancelled
                ? 'border-red-500/40 bg-red-950/40'
                : 'border-emerald-500/40 bg-emerald-950/30'
            }`}>
              {isDenied || isCancelled ? (
                <CircleX className="mx-auto h-14 w-14 text-red-300" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-300" aria-hidden="true" />
              )}
              <h3 className={`mt-3 text-xl font-bold ${isDenied || isCancelled ? 'text-red-50' : 'text-emerald-50'}`}>
                {isCompleted ? 'Action Completed' : isDenied ? 'Action Denied' : isCancelled ? 'Action Cancelled' : 'Action Approved'}
              </h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-300">
                {intent?.dm_response || (isDenied ? 'The DM denied this request.' : 'The DM approved this request.')}
              </p>
              {npcReveal && !isDenied && !isCancelled && (
                <div className="mx-auto mt-5 max-w-2xl text-left">
                  <NpcRevealCard reveal={npcReveal} />
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {isDenied && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="rounded-md border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-amber-500/60"
                  >
                    Edit Request
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {isRollState && (() => {
            const needsSecond = rollRequest ? rollRequest.advantage_state !== 'normal' : false
            const hpEffect = rollRequestHpEffect(rollRequest)
            const canRoll = Boolean(rollRequest && rollRequest.status === 'waiting_for_player') && !inlineOutcome
            const showChoice = canRoll && inlineRollMode === 'choice'
            const showManual = canRoll && inlineRollMode === 'manual'
            const showDamage = inlineRollMode === 'damage' && Boolean(inlinePendingDamage)
            return (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-6 text-center">
                <button
                  type="button"
                  onClick={onInlineRoll}
                  disabled={!showChoice || inlineRollBusy}
                  className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl border border-emerald-400/50 bg-zinc-950 text-2xl font-bold text-emerald-300 shadow-lg shadow-emerald-950/40 transition hover:border-emerald-300 disabled:opacity-60"
                  aria-label="Roll now"
                >
                  {inlineRollAnimating && inlineAnimNumber !== null ? (
                    <span className="text-3xl text-amber-300">{inlineAnimNumber}</span>
                  ) : (
                    <Dices className={`h-14 w-14 ${inlineRollAnimating ? 'animate-spin' : ''}`} aria-hidden="true" />
                  )}
                </button>
                <h3 className="mt-3 text-xl font-bold text-emerald-50">Resolve the Roll</h3>
                <p className="mt-1 text-sm font-semibold text-emerald-100">{actionSummary}</p>

                {rollRequest && (
                  <p className="mt-2 text-xs text-zinc-400">
                    {rollRequest.label}: d20 {rollRequest.modifier >= 0 ? `+${rollRequest.modifier}` : rollRequest.modifier}
                    {rollRequest.target_number !== null ? ` / target ${rollRequest.target_number}` : ''}
                    {rollRequest.advantage_state !== 'normal' ? ` · ${rollRequest.advantage_state}` : ''}
                  </p>
                )}

                {showChoice && (
                  <>
                    <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-300">
                      Tap the dice to roll automatically, or enter a roll you made yourself. Your
                      result stays visible here while the DM reviews it.
                    </p>
                    <button
                      type="button"
                      onClick={onInlineManualToggle}
                      disabled={inlineRollBusy}
                      className="mt-3 text-xs font-semibold text-emerald-300 underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      I rolled manually instead
                    </button>
                  </>
                )}

                {showManual && (
                  <div className="mx-auto mt-4 flex max-w-xs flex-col gap-3 text-left">
                    <label className="flex flex-col gap-1 text-xs text-zinc-400">
                      {hpEffect ? 'Dice total' : 'Natural d20 roll'}
                      <input
                        type="number"
                        min={hpEffect ? 0 : 1}
                        max={hpEffect ? undefined : 20}
                        inputMode="numeric"
                        value={inlineManualOne}
                        onChange={(event) => setInlineManualOne(event.target.value)}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
                      />
                    </label>
                    {!hpEffect && needsSecond && (
                      <label className="flex flex-col gap-1 text-xs text-zinc-400">
                        Second d20 roll ({rollRequest?.advantage_state})
                        <input
                          type="number"
                          min={1}
                          max={20}
                          inputMode="numeric"
                          value={inlineManualTwo}
                          onChange={(event) => setInlineManualTwo(event.target.value)}
                          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
                        />
                      </label>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={onInlineManualToggle}
                        disabled={inlineRollBusy}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={onInlineManualSubmit}
                        disabled={inlineRollBusy}
                        className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                      >
                        Submit manual roll
                      </button>
                    </div>
                  </div>
                )}

                {showDamage && inlinePendingDamage && (
                  <div className="mx-auto mt-4 flex max-w-xs flex-col gap-3 text-left">
                    <div className="rounded-md border border-emerald-800/60 bg-emerald-950/30 p-3">
                      <p className="text-xs font-medium text-emerald-100">Attack hits — enter damage.</p>
                      <p className="mt-1 text-xs text-zinc-400">Damage formula: {inlinePendingDamage.formula}</p>
                      {inlinePendingDamage.critical && (
                        <p className="mt-1 text-[11px] text-amber-200">Critical hit: dice are doubled; modifier added once.</p>
                      )}
                    </div>
                    <label className="flex flex-col gap-1 text-xs text-zinc-400">
                      Damage dice total
                      <input
                        type="number"
                        min={inlinePendingDamage.diceCount}
                        max={inlinePendingDamage.diceCount * inlinePendingDamage.dieSize}
                        inputMode="numeric"
                        value={inlineDamageTotal}
                        onChange={(event) => setInlineDamageTotal(event.target.value)}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={onInlineDamageSubmit}
                      disabled={inlineRollBusy}
                      className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                    >
                      Submit damage
                    </button>
                  </div>
                )}

                {!canRoll && !inlineOutcome && !rollResult && !showDamage && (
                  <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-300">
                    Approved — waiting for the DM to request your roll.
                  </p>
                )}

                {/* Shared outcome panel (same effects/styling as the roll popup). */}
                {inlineOutcome ? (
                  <div className="mx-auto mt-2 max-w-md text-left">
                    <PlayerRollOutcomePanel data={inlineOutcome} onContinue={onClose} />
                  </div>
                ) : (
                  rollResult && (
                    <div className="mx-auto mt-4 max-w-sm rounded-xl border border-emerald-500/40 bg-zinc-950 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Locked roll result</p>
                      <p className="mt-2 text-3xl font-bold text-emerald-100">{rollResult.total}</p>
                      <p className="mt-1 text-sm text-zinc-300">
                        d20 {rollResult.used_natural_roll} {rollResult.modifier >= 0 ? `+ ${rollResult.modifier}` : `- ${Math.abs(rollResult.modifier)}`}
                      </p>
                      <p className="mt-1 text-xs capitalize text-zinc-500">{rollResult.result.replace(/_/g, ' ')}</p>
                    </div>
                  )
                )}

                {intent?.dm_response && <p className="mt-3 text-sm text-emerald-100">DM: {intent.dm_response}</p>}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

function NpcRevealCard({ reveal }: { reveal: NpcRevealPayload }) {
  const sourceLabel =
    reveal.sourceStatus === 'fresh_notion'
      ? 'Updated from Notion'
      : reveal.sourceStatus === 'cached_codex'
        ? 'Latest saved Codex snapshot'
        : 'Map token fallback'

  return (
    <div className="overflow-hidden rounded-xl border border-sky-400/35 bg-zinc-950 shadow-[0_0_32px_rgba(14,165,233,0.18)]">
      <div className="border-b border-zinc-800 bg-gradient-to-r from-sky-500/15 via-fuchsia-500/10 to-zinc-950 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200">NPC Profile</p>
            <h4 className="mt-1 text-lg font-bold text-zinc-50">{reveal.title}</h4>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {reveal.role && (
              <span className="rounded-md border border-fuchsia-400/40 bg-fuchsia-500/15 px-2 py-1 text-xs font-semibold text-fuchsia-100">
                {reveal.role}
              </span>
            )}
            <span className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-100">
              {sourceLabel}
            </span>
          </div>
        </div>
        {reveal.summary && <p className="mt-2 text-sm leading-relaxed text-zinc-300">{reveal.summary}</p>}
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Personality</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-200">
            {reveal.personality || 'No personality notes were revealed yet.'}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Appearance</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-200">
            {reveal.appearance || 'No appearance notes were revealed yet.'}
          </p>
        </div>
      </div>

      <details className="border-t border-zinc-800 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-amber-100">
          Wares {reveal.wares.length > 0 ? `(${reveal.wares.length})` : ''}
        </summary>
        {reveal.wares.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {reveal.wares.map((item, index) => (
              <div key={`${item.name}-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-100">{item.name}</p>
                  {item.price && <span className="text-xs font-semibold text-amber-200">{item.price}</span>}
                </div>
                {(item.quantity || item.description) && (
                  <p className="mt-1 text-xs text-zinc-400">
                    {[item.quantity ? `Qty ${item.quantity}` : null, item.description].filter(Boolean).join(' - ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">No wares were revealed for this character.</p>
        )}
      </details>
    </div>
  )
}

function MessageForm({
  title,
  description,
  value,
  setValue,
  busy,
  buttonLabel,
  onSubmit,
  feedback,
}: {
  title: string
  description: string
  value: string
  setValue: (value: string) => void
  busy: boolean
  buttonLabel: string
  onSubmit: () => void
  feedback: string | null
}) {
  return (
    <div className="grid gap-3">
      {title && (
        <div>
          <p className="text-sm font-semibold text-zinc-100">{title}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
        </div>
      )}
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        maxLength={280}
        placeholder="Type a short message."
        className="resize-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
      />
      <button
        type="button"
        disabled={busy || !value.trim()}
        onClick={onSubmit}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-45"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        {busy ? 'Sending...' : buttonLabel}
      </button>
      {feedback && <p className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-amber-200">{feedback}</p>}
    </div>
  )
}
