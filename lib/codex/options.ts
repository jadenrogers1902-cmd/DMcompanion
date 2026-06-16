import type {
  CampaignDocLiveObjectType,
  CampaignDocRelationType,
  CampaignDocStatus,
  CampaignDocType,
  CampaignDocVisibility,
} from '@/lib/types/database'

// Exact phrase the DM must type to confirm a local Codex wipe. Lives here (a
// plain shared module) so it can be imported by both client components and the
// 'use server' wipe action without violating the server-export rule.
export const WIPE_CONFIRMATION_PHRASE = 'DELETE LOCAL CODEX DATA'

export const CAMPAIGN_DOC_TYPES: { value: CampaignDocType; label: string }[] = [
  { value: 'adventure', label: 'Adventure' },
  { value: 'chapter', label: 'Chapter' },
  { value: 'session', label: 'Session' },
  { value: 'location', label: 'Location' },
  { value: 'sub_location', label: 'Sub-location' },
  { value: 'character', label: 'Character' },
  { value: 'npc', label: 'NPC' },
  { value: 'boss', label: 'Boss' },
  { value: 'hostile_enemy', label: 'Hostile enemy' },
  { value: 'faction', label: 'Faction' },
  { value: 'rumor', label: 'Rumor' },
  { value: 'side_quest', label: 'Side quest' },
  { value: 'main_quest', label: 'Main quest' },
  { value: 'item', label: 'Item' },
  { value: 'loot', label: 'Loot' },
  { value: 'handout', label: 'Handout' },
  { value: 'map_note', label: 'Map note' },
  { value: 'object_note', label: 'Object note' },
]

export const CAMPAIGN_DOC_STATUSES: { value: CampaignDocStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'stale', label: 'Stale' },
]

export const CAMPAIGN_DOC_VISIBILITIES: { value: CampaignDocVisibility; label: string }[] = [
  { value: 'dm_only', label: 'DM only' },
  { value: 'player_safe', label: 'Player-safe' },
  { value: 'revealed', label: 'Revealed' },
]

export const CAMPAIGN_DOC_RELATION_TYPES: { value: CampaignDocRelationType; label: string }[] = [
  { value: 'appears_in', label: 'Appears in' },
  { value: 'located_in', label: 'Located in' },
  { value: 'contains', label: 'Contains' },
  { value: 'related_to', label: 'Related to' },
  { value: 'member_of', label: 'Member of' },
  { value: 'enemy_in', label: 'Enemy in' },
  { value: 'npc_in', label: 'NPC in' },
  { value: 'rumor_for', label: 'Rumor for' },
  { value: 'quest_hook', label: 'Quest hook' },
  { value: 'loot_in', label: 'Loot in' },
  { value: 'map_for', label: 'Map for' },
  { value: 'object_doc', label: 'Object doc' },
  { value: 'token_doc', label: 'Token doc' },
  { value: 'faction_member', label: 'Faction member' },
  { value: 'session_topic', label: 'Session topic' },
]

export const CAMPAIGN_DOC_LIVE_OBJECT_TYPES: { value: CampaignDocLiveObjectType; label: string }[] = [
  { value: 'map', label: 'Map' },
  { value: 'token', label: 'Token' },
  { value: 'object', label: 'Object' },
  { value: 'prepared_map', label: 'Prepared map' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'chapter', label: 'Chapter' },
  { value: 'encounter', label: 'Encounter' },
  { value: 'quest', label: 'Quest' },
  { value: 'npc', label: 'NPC' },
  { value: 'location', label: 'Location' },
  { value: 'handout', label: 'Handout' },
  { value: 'other', label: 'Other' },
]

export function campaignDocTypeLabel(value: string) {
  return CAMPAIGN_DOC_TYPES.find((type) => type.value === value)?.label ?? value
}

export function campaignDocRelationLabel(value: string) {
  return CAMPAIGN_DOC_RELATION_TYPES.find((type) => type.value === value)?.label ?? value
}

