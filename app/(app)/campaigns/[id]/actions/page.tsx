import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ActionCenter } from '@/components/actions/ActionCenter'
import { Badge } from '@/components/ui/Badge'
import { DMUtilityPanel } from '@/components/nav/DMUtilityPanel'
import type {
  ActionIntent,
  ActionAttackResult,
  ActionAttackResultDmDetail,
  ActionHpEffectResult,
  ActionIntentDmNote,
  ActionRollRequest,
  ActionRollResult,
  ActionResult,
  Character,
  CharacterAttack,
  CombatLog,
  GameMap,
  PendingStateUpdate,
  Profile,
  Token,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

type IntentDetails = ActionIntent & {
  actor_character?: Pick<Character, 'id' | 'name' | 'user_id'> | null
  target_token?: Pick<Token, 'id' | 'name' | 'token_type' | 'armor_class' | 'current_hp' | 'max_hp' | 'temp_hp' | 'is_defeated' | 'object_state'> | null
  actor_profile?: Pick<Profile, 'id' | 'display_name'> | null
  action_results?: ActionResult[]
  combat_logs?: CombatLog[]
  action_roll_requests?: ActionRollRequest[]
  action_roll_results?: ActionRollResult[]
  action_attack_results?: ActionAttackResult[]
  action_attack_result_dm_details?: ActionAttackResultDmDetail[]
  action_hp_effect_results?: ActionHpEffectResult[]
  pending_state_updates?: PendingStateUpdate[]
}

export default async function ActionsPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: campaign }, { data: membership }] = await Promise.all([
    supabase.from('campaigns').select('id, name').eq('id', id).single(),
    supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', id)
      .eq('user_id', user.id)
      .single(),
  ])

  if (!campaign) notFound()
  if (!membership) redirect('/dashboard')

  const isDM = membership.role === 'dm'

  // The old player-facing token-interact page is retired — players interact via
  // the live-map guided action flow now. Only the DM Action Queue lives here.
  if (!isDM) redirect(`/campaigns/${id}/live-map`)

  const { data: activeMap } = await supabase
    .from('maps')
    .select('*')
    .eq('campaign_id', id)
    .eq('is_active', true)
    .maybeSingle()

  const map = (activeMap ?? null) as GameMap | null

  const [
    { data: tokensRaw },
    { data: charactersRaw },
    { data: intentsRaw },
    { data: notesRaw },
    { data: resultsRaw },
    { data: combatLogsRaw },
    { data: rollRequestsRaw },
    { data: rollResultsRaw },
    { data: attackResultsRaw },
    { data: hpEffectResultsRaw },
    { data: attackDetailsRaw },
    { data: pendingUpdatesRaw },
  ] = await Promise.all([
    map
      ? supabase.from('tokens').select('*').eq('map_id', map.id)
      : Promise.resolve({ data: [] }),
    supabase.from('characters').select('*').eq('campaign_id', id),
    supabase
      .from('action_intents')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false }),
    isDM
      ? supabase.from('action_intent_dm_notes').select('*').eq('campaign_id', id)
      : Promise.resolve({ data: [] }),
    supabase
      .from('action_results')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('combat_logs')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('action_roll_requests')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('action_roll_results')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('action_attack_results')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('action_hp_effect_results')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false }),
    isDM
      ? supabase
        .from('action_attack_result_dm_details')
        .select('*')
        .eq('campaign_id', id)
      : Promise.resolve({ data: [] }),
    // Pending state updates are DM-only (RLS-enforced) — players never see
    // suggested changes before the DM applies/reveals them.
    isDM
      ? supabase
        .from('pending_state_updates')
        .select('*')
        .eq('campaign_id', id)
        .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  const characters = (charactersRaw ?? []) as Character[]
  const tokens = (tokensRaw ?? []) as Token[]
  const intents = (intentsRaw ?? []) as ActionIntent[]

  // Nudges: recent "Nudge DM" party_messages (reuses the existing nudge system —
  // no new pathway). We match by sender to that player's still-active cards using
  // only base party_messages columns, so this works regardless of which optional
  // migration-016 columns the deployed schema has.
  let nudgedIntentIds: string[] = []
  if (isDM) {
    type NudgeRow = {
      sender_user_id: string | null
      action_intent_id?: string | null
      message_type: string | null
      message: string | null
      handled_at?: string | null
    }
    // Prefer the handled_at-aware query so DM-acknowledged nudges stop
    // re-highlighting after a refresh (QA Phase 5). Fall back to the base
    // columns if the column isn't there yet (migration not applied), treating
    // every nudge as unhandled so highlights still work pre-migration.
    const withHandled = await supabase
      .from('party_messages')
      .select('sender_user_id, action_intent_id, message_type, message, handled_at')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false })
      .limit(100)
    let nudgeRows: NudgeRow[]
    if (withHandled.error) {
      const base = await supabase
        .from('party_messages')
        .select('sender_user_id, message_type, message')
        .eq('campaign_id', id)
        .order('created_at', { ascending: false })
        .limit(100)
      nudgeRows = ((base.data ?? []) as NudgeRow[]).map((row) => ({ ...row, handled_at: null }))
    } else {
      nudgeRows = (withHandled.data ?? []) as NudgeRow[]
    }
    const activeIntentIds = new Set(
      intents
        .filter((intent) => !['denied', 'resolved', 'cancelled'].includes(intent.status))
        .map((intent) => intent.id),
    )

    nudgedIntentIds = Array.from(
      new Set(
        nudgeRows
          .filter(
            (row) =>
              !row.handled_at &&
              row.message_type === 'nudge' &&
              row.action_intent_id &&
              activeIntentIds.has(row.action_intent_id),
          )
          .map((row) => row.action_intent_id as string),
      )
    )

    if (nudgedIntentIds.length === 0 && withHandled.error) {
      const nudgingUserIds = new Set(
        nudgeRows
          .filter(
            (row) =>
              !row.handled_at &&
              (row.message_type === 'nudge' || row.message?.startsWith('Action nudge:')),
          )
          .map((row) => row.sender_user_id)
          .filter((value): value is string => Boolean(value)),
      )
      nudgedIntentIds = intents
        .filter(
          (intent) =>
            !['denied', 'resolved', 'cancelled'].includes(intent.status) &&
            nudgingUserIds.has(intent.actor_user_id),
        )
        .map((intent) => intent.id)
    }
  }
  const loadedCharacterIds = characters.map((character) => character.id)
  const { data: attacksRaw } = await supabase
    .from('character_attacks')
    .select('*')
    .in('character_id', loadedCharacterIds.length ? loadedCharacterIds : ['00000000-0000-0000-0000-000000000000'])

  const characterIds = Array.from(new Set(intents.map((intent) => intent.actor_character_id)))
  const tokenIds = Array.from(new Set(intents.map((intent) => intent.target_token_id)))
  const userIds = Array.from(new Set(intents.map((intent) => intent.actor_user_id)))

  const [{ data: intentCharacters }, { data: intentTokens }, { data: profiles }] =
    await Promise.all([
      characterIds.length
        ? supabase.from('characters').select('id, name, user_id').in('id', characterIds)
        : Promise.resolve({ data: [] }),
      tokenIds.length
        ? supabase.from('tokens').select('id, name, token_type, armor_class, current_hp, max_hp, temp_hp, is_defeated, object_state').in('id', tokenIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? supabase.from('profiles').select('id, display_name').in('id', userIds)
        : Promise.resolve({ data: [] }),
    ])

  const characterMap: Record<string, Pick<Character, 'id' | 'name' | 'user_id'>> = {}
  ;((intentCharacters ?? []) as Pick<Character, 'id' | 'name' | 'user_id'>[]).forEach(
    (character) => {
      characterMap[character.id] = character
    },
  )

  const tokenMap: Record<string, Pick<Token, 'id' | 'name' | 'token_type' | 'armor_class' | 'current_hp' | 'max_hp' | 'temp_hp' | 'is_defeated' | 'object_state'>> = {}
  ;((intentTokens ?? []) as Pick<Token, 'id' | 'name' | 'token_type' | 'armor_class' | 'current_hp' | 'max_hp' | 'temp_hp' | 'is_defeated' | 'object_state'>[]).forEach(
    (token) => {
      tokenMap[token.id] = token
    },
  )

  const profileMap: Record<string, Pick<Profile, 'id' | 'display_name'>> = {}
  ;((profiles ?? []) as Pick<Profile, 'id' | 'display_name'>[]).forEach((profile) => {
    profileMap[profile.id] = profile
  })

  const dmNotes: Record<string, string> = {}
  ;((notesRaw ?? []) as ActionIntentDmNote[]).forEach((note) => {
    dmNotes[note.intent_id] = note.content ?? ''
  })

  const resultsByIntent: Record<string, ActionResult[]> = {}
  ;((resultsRaw ?? []) as ActionResult[]).forEach((result) => {
    resultsByIntent[result.action_intent_id] ??= []
    resultsByIntent[result.action_intent_id].push(result)
  })

  const logsByIntent: Record<string, CombatLog[]> = {}
  ;((combatLogsRaw ?? []) as CombatLog[]).forEach((log) => {
    if (!log.action_intent_id) return
    logsByIntent[log.action_intent_id] ??= []
    logsByIntent[log.action_intent_id].push(log)
  })

  const rollRequestsByIntent: Record<string, ActionRollRequest[]> = {}
  ;((rollRequestsRaw ?? []) as ActionRollRequest[]).forEach((request) => {
    rollRequestsByIntent[request.action_intent_id] ??= []
    rollRequestsByIntent[request.action_intent_id].push(request)
  })

  const rollResultsByIntent: Record<string, ActionRollResult[]> = {}
  ;((rollResultsRaw ?? []) as ActionRollResult[]).forEach((result) => {
    rollResultsByIntent[result.action_intent_id] ??= []
    rollResultsByIntent[result.action_intent_id].push(result)
  })

  const attackResultsByIntent: Record<string, ActionAttackResult[]> = {}
  ;((attackResultsRaw ?? []) as ActionAttackResult[]).forEach((result) => {
    attackResultsByIntent[result.action_intent_id] ??= []
    attackResultsByIntent[result.action_intent_id].push(result)
  })

  const hpEffectResultsByIntent: Record<string, ActionHpEffectResult[]> = {}
  ;((hpEffectResultsRaw ?? []) as ActionHpEffectResult[]).forEach((result) => {
    hpEffectResultsByIntent[result.action_intent_id] ??= []
    hpEffectResultsByIntent[result.action_intent_id].push(result)
  })

  const attackDetailsByResult: Record<string, ActionAttackResultDmDetail> = {}
  ;((attackDetailsRaw ?? []) as ActionAttackResultDmDetail[]).forEach((detail) => {
    attackDetailsByResult[detail.attack_result_id] = detail
  })

  const pendingUpdatesByIntent: Record<string, PendingStateUpdate[]> = {}
  ;((pendingUpdatesRaw ?? []) as PendingStateUpdate[]).forEach((update) => {
    if (!update.action_intent_id) return
    pendingUpdatesByIntent[update.action_intent_id] ??= []
    pendingUpdatesByIntent[update.action_intent_id].push(update)
  })

  const detailedIntents: IntentDetails[] = intents.map((intent) => ({
    ...intent,
    actor_character: characterMap[intent.actor_character_id] ?? null,
    target_token: tokenMap[intent.target_token_id] ?? null,
    actor_profile: profileMap[intent.actor_user_id] ?? null,
    action_results: resultsByIntent[intent.id] ?? [],
    combat_logs: logsByIntent[intent.id] ?? [],
    action_roll_requests: rollRequestsByIntent[intent.id] ?? [],
    action_roll_results: rollResultsByIntent[intent.id] ?? [],
    action_attack_results: attackResultsByIntent[intent.id] ?? [],
    action_hp_effect_results: hpEffectResultsByIntent[intent.id] ?? [],
    action_attack_result_dm_details: (attackResultsByIntent[intent.id] ?? [])
      .map((result) => attackDetailsByResult[result.id])
      .filter((detail): detail is ActionAttackResultDmDetail => Boolean(detail)),
    pending_state_updates: pendingUpdatesByIntent[intent.id] ?? [],
  }))

  const pageContent = (
    <>
      <Link
        href={`/campaigns/${id}`}
        className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {campaign.name}
      </Link>
      <div className="mb-5">
        <Badge variant={isDM ? 'dm' : 'player'}>{isDM ? 'DM' : 'Player'}</Badge>
      </div>
      <ActionCenter
        campaignId={id}
        isDM={isDM}
        map={map}
        tokens={tokens}
        characters={characters}
        intents={detailedIntents}
        dmNotes={dmNotes}
        attacks={(attacksRaw ?? []) as CharacterAttack[]}
        actionResults={(resultsRaw ?? []) as ActionResult[]}
        combatLogs={(combatLogsRaw ?? []) as CombatLog[]}
        currentUserId={user.id}
        nudgedIntentIds={nudgedIntentIds}
      />
    </>
  )

  if (isDM) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">{pageContent}</div>
          <DMUtilityPanel
            campaignId={id}
            campaignName={campaign.name}
            activeMapName={map?.name}
            pendingRequests={intents.filter((intent) =>
              ['pending', 'needs_roll', 'approved', 'approved_waiting_for_roll', 'rolling', 'rolled_waiting_for_dm', 'resolving'].includes(intent.status),
            ).length}
            characterCount={characters.length}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {pageContent}
    </div>
  )
}
