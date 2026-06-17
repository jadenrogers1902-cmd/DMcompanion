// Shared prepared-map → live-map instantiation. Kept out of a `'use server'`
// module so it can take a Supabase client argument and be reused by both the
// DM deploy action (user client) and the player transport-travel action
// (service-role admin client). Server-only logic — never imported by the client.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdventureStatus, PreparedMap, PreparedMapToken } from '@/lib/types/adventure'
import type { Database } from '@/lib/types/database'
import {
  normalizePrepLinks,
  normalizePrepNotes,
  normalizeTags,
} from '@/components/adventures/prep-metadata'
import {
  normalizePreparedToken,
  normalizeTokenResource,
  revealStateIsPlayerVisible,
  toLiveTokenType,
} from '@/components/adventures/token-meta'

const STATUSES: AdventureStatus[] = ['draft', 'ready', 'active', 'archived']
const MAX_TOKENS = 200
const MAX_TOKEN_LINKS = 20

export function sanitizeTokens(tokens: PreparedMapToken[]): PreparedMapToken[] {
  return tokens.slice(0, MAX_TOKENS).map((raw) => {
    const token = normalizePreparedToken(raw)
    return {
      ...token,
      name: token.name.slice(0, 80),
      linked_campaign_doc_id: token.linked_campaign_doc_id || null,
      linked_prepared_map_id: token.linked_prepared_map_id || null,
      source: token.source ? String(token.source).slice(0, 40) : null,
      is_dynamic: Boolean(token.is_dynamic),
      can_move: Boolean(token.can_move),
      can_participate_in_combat: Boolean(token.can_participate_in_combat),
      interactable: Boolean(token.interactable),
      object_state: token.object_state ? String(token.object_state).slice(0, 40) : null,
      icon: token.icon.slice(0, 8),
      x: Math.round(token.x),
      y: Math.round(token.y),
      size: Math.min(10, Math.max(0.5, token.size)),
      color: /^#[0-9a-fA-F]{6}$/.test(token.color) ? token.color : '#a1a1aa',
      description: token.description.slice(0, 2000),
      dm_notes: token.dm_notes.slice(0, 4000),
      prep_notes: normalizePrepNotes(token.prep_notes, 'token', token.id),
      player_notes: token.player_notes.slice(0, 2000),
      status: STATUSES.includes(token.status) ? token.status : 'draft',
      tags: normalizeTags(token.tags),
      links: normalizePrepLinks(token.links, 'token', token.id).slice(0, MAX_TOKEN_LINKS),
      resource: normalizeTokenResource(token.resource),
    }
  })
}

/**
 * Copies a prepared scene's image and creates fresh, independent live `maps` +
 * `tokens` rows (inactive — the caller decides whether/when to activate). The
 * prepared original is never mutated. DM-only token notes carry into the DM-only
 * token_dm_notes table; linked Codex docs become live `campaign_doc_links`.
 * Transport tokens carry their destination prepared map onto the live token.
 */
export async function instantiatePreparedMap(
  client: SupabaseClient<Database>,
  {
    campaignId,
    prepared,
    liveName,
    createdBy,
  }: { campaignId: string; prepared: PreparedMap; liveName: string; createdBy: string },
): Promise<{ liveMapId: string } | { error: string }> {
  if (!prepared.storage_path || !prepared.width || !prepared.height) {
    return { error: 'Add a background image before sending this map to the Live Map.' }
  }

  // Copy the image so deleting the prepared map later never breaks the live map.
  const ext = prepared.storage_path.split('.').pop() || 'png'
  const livePath = `${campaignId}/${crypto.randomUUID()}.${ext}`
  const { error: copyError } = await client.storage.from('maps').copy(prepared.storage_path, livePath)
  if (copyError) return { error: `Could not copy map image: ${copyError.message}` }

  const { data: liveMap, error: mapError } = await client
    .from('maps')
    .insert({
      campaign_id: campaignId,
      name: liveName,
      storage_path: livePath,
      width: prepared.width,
      height: prepared.height,
      // Always insert inactive; the caller activates if needed.
      is_active: false,
      source_prepared_map_id: prepared.id,
      created_by: createdBy,
    })
    .select()
    .single()
  if (mapError || !liveMap) {
    await client.storage.from('maps').remove([livePath])
    return { error: mapError?.message ?? 'Failed to create live map.' }
  }

  // Apply prepared grid settings to the live map.
  await client
    .from('maps')
    .update({ grid_enabled: prepared.grid_enabled, grid_size: prepared.grid_size })
    .eq('id', liveMap.id)

  // Instantiate prepared tokens as live tokens. Prep-only types map to the
  // closest live concept (item→object, clue→note, location→custom,
  // transport→portal), and reveal_state collapses to the live visibility flag —
  // only 'visible' deploys player-visible. Player-facing notes become the public
  // description.
  const tokens = sanitizeTokens(prepared.tokens ?? [])
  if (tokens.length > 0) {
    const { data: liveTokens, error: tokenError } = await client
      .from('tokens')
      .insert(
        tokens.map((token) => ({
          campaign_id: campaignId,
          map_id: liveMap.id,
          token_type: toLiveTokenType(token.token_type),
          name: token.name,
          x: token.x,
          y: token.y,
          size: token.size,
          color: token.color,
          visible_to_players: revealStateIsPlayerVisible(token.reveal_state),
          public_description: token.player_notes || token.description || null,
          movement_locked: token.can_move === false,
          interactable: Boolean(token.interactable),
          object_state: token.object_state || null,
          destination_prepared_map_id: token.linked_prepared_map_id || null,
          requires_approval: Boolean(token.interactable),
        })),
      )
      .select('id')
    if (tokenError) {
      return {
        error: `Live map "${prepared.title}" was created, but tokens failed to copy: ${tokenError.message}`,
      }
    }

    // Carry DM-only token notes into the live token_dm_notes table (unpublished,
    // DM-only). RETURNING preserves insert order, so indexes line up.
    const dmNoteRows = (liveTokens ?? [])
      .map((live, index) => ({ live, prep: tokens[index] }))
      .filter(({ prep }) => prep?.dm_notes?.trim())
      .map(({ live, prep }) => ({
        token_id: live.id,
        campaign_id: campaignId,
        content: prep.dm_notes.trim(),
      }))
    if (dmNoteRows.length > 0) {
      // Best-effort: a failure here should not fail the whole deploy.
      await client.from('token_dm_notes').insert(dmNoteRows)
    }

    const linkedPrepTokens = (liveTokens ?? [])
      .map((live, index) => ({ live, prep: tokens[index] }))
      .filter(({ prep }) => prep?.linked_campaign_doc_id)

    if (linkedPrepTokens.length > 0) {
      const linkedDocIds = Array.from(
        new Set(linkedPrepTokens.map(({ prep }) => prep.linked_campaign_doc_id).filter(Boolean) as string[]),
      )
      const { data: linkedDocs } = await client
        .from('campaign_docs')
        .select('id, visibility')
        .eq('campaign_id', campaignId)
        .in('id', linkedDocIds)
      const visibilityByDoc = new Map(
        (linkedDocs ?? []).map((doc) => [doc.id, doc.visibility ?? 'dm_only']),
      )

      await client.from('campaign_doc_links').insert(
        linkedPrepTokens.map(({ live, prep }) => {
          const liveObjectType = prep.is_dynamic === false ? 'object' : 'token'
          const docVisibility = visibilityByDoc.get(prep.linked_campaign_doc_id!) ?? 'dm_only'
          return {
            campaign_id: campaignId,
            source_doc_id: prep.linked_campaign_doc_id!,
            live_object_type: liveObjectType,
            live_object_id: live.id,
            live_object_label: prep.name,
            relationship_type: liveObjectType === 'object' ? 'object_doc' : 'token_doc',
            visibility:
              docVisibility === 'revealed' || docVisibility === 'player_safe' ? docVisibility : 'dm_only',
            created_by: createdBy,
          }
        }),
      )
    }
  }

  return { liveMapId: liveMap.id }
}
