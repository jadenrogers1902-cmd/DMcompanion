'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { tokenTypeColor, type Database, type TokenType, type TravelMode } from '@/lib/types/database'

type MapUpdate = Database['public']['Tables']['maps']['Update']
type TokenUpdate = Database['public']['Tables']['tokens']['Update']

type TravelOptionsInput = {
  travelMode?: TravelMode
  partyOptionsLocked?: boolean
  groupMovementUnlimited?: boolean
  freeroamMovementUnlimited?: boolean
  playerVisionRadiusFeet?: number
}

function travelMigrationError(message: string) {
  const lower = message.toLowerCase()
  if (
    lower.includes('schema cache') ||
    lower.includes('could not find the function') ||
    lower.includes('function public.create_travel_party') ||
    lower.includes('function public.set_map_travel_options') ||
    lower.includes('function public.respond_travel_party_invite') ||
    lower.includes('function public.review_travel_party') ||
    lower.includes('relation "map_travel_parties"') ||
    lower.includes('column maps.travel_mode') ||
    lower.includes('column maps.player_vision_radius_feet')
  ) {
    return 'Travel options are not ready on the database yet. Apply the latest Supabase travel/vision migrations to production, then try again.'
  }
  return message
}

// ────────────────────────────────────────────────────────────
// Maps
// ────────────────────────────────────────────────────────────
export async function createMap(
  campaignId: string,
  input: { name: string; storage_path: string; width: number; height: number },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const name = input.name?.trim()
  if (!name) return { error: 'Map name is required.' }

  // If the campaign has no active map yet, make this one active.
  const { data: activeMaps } = await supabase
    .from('maps')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .limit(1)

  const makeActive = !activeMaps || activeMaps.length === 0

  const { data: map, error } = await supabase
    .from('maps')
    .insert({
      campaign_id: campaignId,
      name,
      storage_path: input.storage_path,
      width: Math.round(input.width),
      height: Math.round(input.height),
      is_active: makeActive,
      created_by: user.id,
    })
    .select()
    .single()

  if (error || !map) return { error: error?.message ?? 'Failed to create map.' }

  return { mapId: map.id }
}

export async function updateMapSettings(
  campaignId: string,
  mapId: string,
  settings: {
    name?: string
    grid_enabled?: boolean
    grid_size?: number
    grid_scale_feet?: number
    grid_color?: string
    grid_opacity?: number
    grid_line_width?: number
    grid_subdivisions?: number
    grid_offset_x?: number
    grid_offset_y?: number
    dm_light_brightness?: number
  },
) {
  const supabase = await createClient()
  const update: MapUpdate = {}
  if (settings.name !== undefined) update.name = settings.name.trim()
  if (settings.grid_enabled !== undefined) update.grid_enabled = settings.grid_enabled
  if (settings.grid_size !== undefined)
    update.grid_size = Math.max(5, Math.round(settings.grid_size))
  if (settings.grid_scale_feet !== undefined)
    update.grid_scale_feet = Math.max(1, Math.round(settings.grid_scale_feet))
  if (settings.grid_color !== undefined) {
    const color = settings.grid_color.trim()
    update.grid_color = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#ffffff'
  }
  if (settings.grid_opacity !== undefined)
    update.grid_opacity = Math.min(1, Math.max(0.05, Number(settings.grid_opacity)))
  if (settings.grid_line_width !== undefined)
    update.grid_line_width = Math.min(6, Math.max(0.5, Number(settings.grid_line_width)))
  if (settings.grid_subdivisions !== undefined)
    update.grid_subdivisions = Math.min(8, Math.max(1, Math.round(settings.grid_subdivisions)))
  if (settings.grid_offset_x !== undefined)
    update.grid_offset_x = Math.round(settings.grid_offset_x)
  if (settings.grid_offset_y !== undefined)
    update.grid_offset_y = Math.round(settings.grid_offset_y)
  if (settings.dm_light_brightness !== undefined)
    update.dm_light_brightness = Math.min(0.6, Math.max(0, Number(settings.dm_light_brightness)))

  const { error } = await supabase.from('maps').update(update).eq('id', mapId)
  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  revalidatePath(`/campaigns/${campaignId}/live-map`)
  return { success: true }
}

export async function setActiveMap(campaignId: string, mapId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_active_map', {
    p_campaign_id: campaignId,
    p_map_id: mapId,
  })
  if (error) return { error: travelMigrationError(error.message) }

  revalidatePath(`/campaigns/${campaignId}/live-map`)
  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

export async function deleteMap(
  campaignId: string,
  mapId: string,
  storagePath: string,
) {
  const supabase = await createClient()

  // Remove the row first (RLS ensures DM-only); cascade removes tokens.
  const { error } = await supabase.from('maps').delete().eq('id', mapId)
  if (error) return { error: travelMigrationError(error.message) }

  // Best-effort storage cleanup.
  if (storagePath) {
    await supabase.storage.from('maps').remove([storagePath])
  }

  redirect(`/campaigns/${campaignId}/live-map`)
}

// ────────────────────────────────────────────────────────────
// Tokens
// ────────────────────────────────────────────────────────────
// Token types that start hidden from players by default (secret threats).
const STARTS_HIDDEN: TokenType[] = ['enemy', 'trap', 'door']
// Object-ish types that the DM probably wants players to be able to
// interact with right away (chests, levers, books, etc).
const STARTS_INTERACTABLE: TokenType[] = [
  'player', 'npc', 'enemy', 'door', 'trap', 'object',
  'chest', 'book', 'note', 'loot', 'lever', 'switch',
  'portal', 'key', 'container', 'custom',
]

export async function addToken(
  campaignId: string,
  mapId: string,
  input: { token_type: TokenType; name: string; x: number; y: number; size?: number },
) {
  const supabase = await createClient()

  const { data: token, error } = await supabase
    .from('tokens')
    .insert({
      campaign_id: campaignId,
      map_id: mapId,
      token_type: input.token_type,
      name: input.name?.trim() ?? '',
      x: input.x,
      y: input.y,
      size: input.size ?? 1,
      color: tokenTypeColor(input.token_type),
      // Enemies, traps, and doors start hidden from players by default.
      visible_to_players: !STARTS_HIDDEN.includes(input.token_type),
      // Most token/object types are interactable by default; the DM can
      // turn this off per-token. Pure scenery ("object") starts off.
      interactable: STARTS_INTERACTABLE.includes(input.token_type) && input.token_type !== 'object',
      object_state: 'visible',
    })
    .select()
    .single()

  if (error || !token) return { error: error?.message ?? 'Failed to add token.' }

  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { token }
}

// DM move. Re-anchors the movement round (last = new position, used = 0).
export async function updateTokenPosition(
  campaignId: string,
  tokenId: string,
  x: number,
  y: number,
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: token } = await supabase
    .from('tokens')
    .select('id, map_id, controlled_by_user_id')
    .eq('id', tokenId)
    .single()
  if (!token) return { error: 'Token not found' }

  const { data: map } = await supabase
    .from('maps')
    .select('id, grid_size, grid_scale_feet, travel_mode')
    .eq('id', token.map_id)
    .single()
  if (!map) return { error: 'Map not found' }

  if (map.travel_mode === 'group_party' && token.controlled_by_user_id) {
    const { data: member } = await supabase
      .from('map_travel_party_members')
      .select('party_id')
      .eq('map_id', token.map_id)
      .eq('user_id', token.controlled_by_user_id)
      .eq('status', 'accepted')
      .limit(1)
      .maybeSingle()

    if (member?.party_id) {
      const { data: party } = await supabase
        .from('map_travel_parties')
        .select('id, status')
        .eq('id', member.party_id)
        .eq('status', 'approved')
        .maybeSingle()

      if (party) {
        const { data: members } = await supabase
          .from('map_travel_party_members')
          .select('user_id')
          .eq('party_id', party.id)
          .eq('status', 'accepted')

        const memberUserIds = (members ?? []).map((row) => row.user_id)
        if (memberUserIds.length === 0) return { error: 'No accepted party members found.' }
        const { data: partyTokens } = await supabase
          .from('tokens')
          .select('id')
          .eq('map_id', token.map_id)
          .eq('visible_to_players', true)
          .eq('token_type', 'player')
          .eq('movement_locked', false)
          .in('controlled_by_user_id', memberUserIds)
          .order('created_at', { ascending: true })

        const offsets = [
          [0, 0], [0, -1], [1, 0], [0, 1], [-1, 0],
          [1, -1], [1, 1], [-1, 1], [-1, -1],
          [0, -2], [2, 0], [0, 2], [-2, 0],
          [2, -1], [2, 1], [-2, 1], [-2, -1],
        ]
        const gridSize = Math.max(1, map.grid_size)
        const scale = Math.max(1, map.grid_scale_feet)
        const revealRadius = (7 / scale) * gridSize

        for (let index = 0; index < (partyTokens ?? []).length && index < offsets.length; index += 1) {
          const [ox, oy] = offsets[index]
          const nextX = x + ox * gridSize
          const nextY = y + oy * gridSize
          await supabase
            .from('tokens')
            .update({ x: nextX, y: nextY, last_x: nextX, last_y: nextY, movement_used: 0 })
            .eq('id', partyTokens![index].id)
          await supabase.from('map_revealed_areas').insert({
            campaign_id: campaignId,
            map_id: token.map_id,
            shape_type: 'circle',
            x: nextX,
            y: nextY,
            radius: revealRadius,
            visible_to_players: true,
            created_by: user.id,
          })
        }

        return { success: true }
      }
    }
  }

  const { error } = await supabase
    .from('tokens')
    .update({ x, y, last_x: x, last_y: y, movement_used: 0 })
    .eq('id', tokenId)
  if (error) return { error: travelMigrationError(error.message) }
  return { success: true }
}

// Player move — goes through the SECURITY DEFINER RPC, which enforces
// control, locks, and the speed limit server-side.
export async function movePlayerToken(
  tokenId: string,
  x: number,
  y: number,
) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('move_token', {
    p_token_id: tokenId,
    p_x: x,
    p_y: y,
  })
  if (error) return { error: travelMigrationError(error.message) }
  return data ?? { error: 'No response from server.' }
}

export async function updateToken(
  campaignId: string,
  mapId: string,
  tokenId: string,
  fields: {
    name?: string
    token_type?: TokenType
    size?: number
    color?: string
    visible_to_players?: boolean
    notes?: string | null
    linked_character_id?: string | null
    controlled_by_user_id?: string | null
    interaction_range_feet?: number
    available_actions?: string[] | null
    hidden_dm_actions?: string[] | null
    interactable?: boolean
    object_state?: string | null
    discoverable?: boolean
    public_description?: string | null
    visible_on_cast?: boolean
    requires_approval?: boolean
    resolver_type?: 'manual' | 'attack' | 'object_state'
    resolver_config?: Record<string, unknown>
    max_hp?: number
    current_hp?: number
    temp_hp?: number
    armor_class?: number
    is_defeated?: boolean
  },
) {
  const supabase = await createClient()
  const update: TokenUpdate = { ...fields }
  if (fields.name !== undefined) update.name = fields.name.trim()
  if (fields.size !== undefined) update.size = Math.max(0.25, fields.size)
  if (fields.interaction_range_feet !== undefined) {
    update.interaction_range_feet = Math.max(0, Math.round(fields.interaction_range_feet))
  }
  if (fields.public_description !== undefined) {
    update.public_description = fields.public_description?.trim() || null
  }
  if (fields.object_state !== undefined) {
    update.object_state = fields.object_state?.trim() || null
  }
  if (fields.max_hp !== undefined) update.max_hp = Math.max(0, Math.round(fields.max_hp))
  if (fields.current_hp !== undefined) update.current_hp = Math.max(0, Math.round(fields.current_hp))
  if (fields.temp_hp !== undefined) update.temp_hp = Math.max(0, Math.round(fields.temp_hp))
  if (fields.armor_class !== undefined) update.armor_class = Math.max(0, Math.round(fields.armor_class))

  // When the linked character changes, keep token control in sync:
  // the controller becomes that character's owner (or nobody if unlinked).
  if (fields.linked_character_id !== undefined) {
    if (fields.linked_character_id) {
      const { data: char } = await supabase
        .from('characters')
        .select('user_id')
        .eq('id', fields.linked_character_id)
        .single()
      update.controlled_by_user_id = char?.user_id ?? null
    } else {
      update.controlled_by_user_id = null
    }
  }

  const { error } = await supabase.from('tokens').update(update).eq('id', tokenId)
  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

// DM-only token note, stored in a separate table so it is never broadcast
// to players over realtime.
export async function upsertTokenDmNote(
  campaignId: string,
  mapId: string,
  tokenId: string,
  content: string,
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('token_dm_notes')
    .upsert(
      { token_id: tokenId, campaign_id: campaignId, content },
      { onConflict: 'token_id' },
    )
  if (error) return { error: error.message }
  return { success: true }
}

// ────────────────────────────────────────────────────────────
// DM movement controls
// ────────────────────────────────────────────────────────────
export async function setMapMovementLock(
  campaignId: string,
  mapId: string,
  locked: boolean,
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('maps')
    .update({ player_movement_locked: locked })
    .eq('id', mapId)
  if (error) return { error: error.message }
  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

export async function setMapTravelOptions(
  campaignId: string,
  mapId: string,
  input: TravelOptionsInput,
) {
  const supabase = await createClient()
  const args: Database['public']['Functions']['set_map_travel_options']['Args'] = {
    p_map_id: mapId,
    p_travel_mode: input.travelMode ?? null,
    p_party_options_locked: input.partyOptionsLocked ?? null,
    p_group_movement_unlimited: input.groupMovementUnlimited ?? null,
    p_freeroam_movement_unlimited: input.freeroamMovementUnlimited ?? null,
  }
  if (input.playerVisionRadiusFeet !== undefined) {
    args.p_player_vision_radius_feet = input.playerVisionRadiusFeet
  }
  const { data, error } = await supabase.rpc('set_map_travel_options', args)
  if (error) return { error: error.message }
  if (data?.error) return { error: data.error }
  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  revalidatePath(`/campaigns/${campaignId}/live-map`)
  return { success: true }
}

export async function createTravelParty(
  campaignId: string,
  mapId: string,
  input: { name: string; leaderUserId: string; memberUserIds: string[] },
) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_travel_party', {
    p_campaign_id: campaignId,
    p_map_id: mapId,
    p_name: input.name,
    p_leader_user_id: input.leaderUserId,
    p_member_user_ids: input.memberUserIds,
  })
  if (error) return { error: error.message }
  if (data?.error) return { error: data.error }
  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  revalidatePath(`/campaigns/${campaignId}/live-map`)
  return { success: true, partyId: data?.party_id as string | undefined }
}

export async function respondTravelPartyInvite(
  campaignId: string,
  mapId: string,
  partyId: string,
  accepted: boolean,
) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('respond_travel_party_invite', {
    p_party_id: partyId,
    p_accepted: accepted,
  })
  if (error) return { error: error.message }
  if (data?.error) return { error: data.error }
  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  revalidatePath(`/campaigns/${campaignId}/live-map`)
  return { success: true }
}

export async function reviewTravelParty(
  campaignId: string,
  mapId: string,
  partyId: string,
  approved: boolean,
  dmResponse = '',
) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('review_travel_party', {
    p_party_id: partyId,
    p_approved: approved,
    p_dm_response: dmResponse,
  })
  if (error) return { error: error.message }
  if (data?.error) return { error: data.error }
  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  revalidatePath(`/campaigns/${campaignId}/live-map`)
  return { success: true }
}

export async function setTokenMovementLock(
  campaignId: string,
  mapId: string,
  tokenId: string,
  locked: boolean,
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tokens')
    .update({ movement_locked: locked })
    .eq('id', tokenId)
  if (error) return { error: error.message }
  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

export async function setTokenOverride(
  campaignId: string,
  mapId: string,
  tokenId: string,
  allowed: boolean,
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tokens')
    .update({ movement_override_allowed: allowed })
    .eq('id', tokenId)
  if (error) return { error: error.message }
  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

// Reset the movement round: anchor = current position, used = 0.
export async function resetTokenMovement(
  campaignId: string,
  mapId: string,
  tokenId: string,
) {
  const supabase = await createClient()
  const { data: tok } = await supabase
    .from('tokens')
    .select('x, y')
    .eq('id', tokenId)
    .single()
  if (!tok) return { error: 'Token not found' }

  const { error } = await supabase
    .from('tokens')
    .update({ last_x: tok.x, last_y: tok.y, movement_used: 0 })
    .eq('id', tokenId)
  if (error) return { error: error.message }
  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

// Snap a token back to its round anchor (undo this round's movement).
export async function resetTokenPosition(
  campaignId: string,
  mapId: string,
  tokenId: string,
) {
  const supabase = await createClient()
  const { data: tok } = await supabase
    .from('tokens')
    .select('x, y, last_x, last_y')
    .eq('id', tokenId)
    .single()
  if (!tok) return { error: 'Token not found' }

  const anchorX = tok.last_x ?? tok.x
  const anchorY = tok.last_y ?? tok.y

  const { error } = await supabase
    .from('tokens')
    .update({ x: anchorX, y: anchorY, movement_used: 0 })
    .eq('id', tokenId)
  if (error) return { error: error.message }
  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

export async function deleteToken(
  campaignId: string,
  mapId: string,
  tokenId: string,
) {
  const supabase = await createClient()
  const { error } = await supabase.from('tokens').delete().eq('id', tokenId)
  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

// ────────────────────────────────────────────────────────────
// Revealed areas (fog/reveal layer) — DM only.
// First version: hide/reveal whole map, rectangles, circles. Players only
// ever receive rows where visible_to_players = TRUE on the active map (RLS).
// ────────────────────────────────────────────────────────────
export async function revealEntireMap(campaignId: string, mapId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Clear any existing area rows for a clean slate, then add one full reveal.
  await supabase.from('map_revealed_areas').delete().eq('map_id', mapId)

  const { error } = await supabase.from('map_revealed_areas').insert({
    campaign_id: campaignId,
    map_id: mapId,
    shape_type: 'full',
    visible_to_players: true,
    created_by: user.id,
  })
  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

export async function hideEntireMap(campaignId: string, mapId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('map_revealed_areas').delete().eq('map_id', mapId)
  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

export async function addRevealedArea(
  campaignId: string,
  mapId: string,
  input:
    | { shape_type: 'rectangle'; x: number; y: number; width: number; height: number }
    | { shape_type: 'circle'; x: number; y: number; radius: number },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const row: Database['public']['Tables']['map_revealed_areas']['Insert'] =
    input.shape_type === 'rectangle'
      ? {
          campaign_id: campaignId,
          map_id: mapId,
          shape_type: 'rectangle',
          x: input.x,
          y: input.y,
          width: Math.max(1, input.width),
          height: Math.max(1, input.height),
          radius: null,
          visible_to_players: true,
          created_by: user.id,
        }
      : {
          campaign_id: campaignId,
          map_id: mapId,
          shape_type: 'circle',
          x: input.x,
          y: input.y,
          width: null,
          height: null,
          radius: Math.max(1, input.radius),
          visible_to_players: true,
          created_by: user.id,
        }

  const { error } = await supabase.from('map_revealed_areas').insert(row)
  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

// Toggle a previously-revealed area back to hidden (or vice versa) without
// deleting it, so the DM can re-reveal the same region later.
export async function setRevealedAreaVisibility(
  campaignId: string,
  mapId: string,
  areaId: string,
  visible: boolean,
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('map_revealed_areas')
    .update({ visible_to_players: visible })
    .eq('id', areaId)
  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

export async function deleteRevealedArea(campaignId: string, mapId: string, areaId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('map_revealed_areas').delete().eq('id', areaId)
  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}
