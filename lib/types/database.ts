// ────────────────────────────────────────────────────────────
// App-level type aliases (used throughout the codebase)
// ────────────────────────────────────────────────────────────
export type Role = 'dm' | 'player'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

export interface Campaign {
  id: string
  name: string
  description: string | null
  owner_id: string
  invite_code: string
  created_at: string
  updated_at: string
}

export interface CampaignMember {
  id: string
  campaign_id: string
  user_id: string
  role: Role
  joined_at: string
}

export interface Character {
  id: string
  campaign_id: string
  user_id: string
  name: string
  class: string | null
  level: number
  race: string | null
  background: string | null
  armor_class: number
  max_hp: number
  current_hp: number
  temp_hp: number
  speed: number
  initiative_bonus: number
  passive_perception: number
  proficiency_bonus: number
  str: number
  dex: number
  con: number
  intel: number
  wis: number
  cha: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface InventoryItem {
  id: string
  character_id: string
  name: string
  quantity: number
  description: string | null
  equipped: boolean
  magical: boolean
  visible_to_dm: boolean
  notes: string | null
  created_at: string
}

export interface Spell {
  id: string
  character_id: string
  name: string
  spell_level: number
  prepared: boolean
  uses: string | null
  description: string | null
  notes: string | null
  created_at: string
}

export interface Ability {
  id: string
  character_id: string
  name: string
  source: string | null
  uses: string | null
  reset_type: string | null
  description: string | null
  notes: string | null
  created_at: string
}

export interface Condition {
  id: string
  character_id: string
  name: string
  notes: string | null
  created_at: string
}

/** Base (whole-map) fog applied to players. See migration 20260621230000. */
export type FogMode = 'none' | 'rooms' | 'hidden'
export type FogStyle = 'blackout' | 'dim'

export interface GameMap {
  id: string
  campaign_id: string
  name: string
  storage_path: string
  grid_enabled: boolean
  grid_size: number
  grid_scale_feet: number
  grid_color: string
  grid_opacity: number
  grid_line_width: number
  grid_subdivisions: number
  grid_offset_x: number
  grid_offset_y: number
  dm_light_brightness: number
  width: number
  height: number
  is_active: boolean
  player_movement_locked: boolean
  travel_mode: TravelMode
  party_options_locked: boolean
  group_movement_unlimited: boolean
  freeroam_movement_unlimited: boolean
  player_vision_radius_feet: number
  cast_settings: Record<string, unknown>
  combat_round: number
  source_prepared_map_id: string | null
  fog_mode: FogMode
  fog_style: FogStyle
  created_by: string
  created_at: string
  updated_at: string
}

export type TravelMode = 'group_party' | 'freeroam' | 'combat'
export type TravelPartyStatus = 'pending_dm' | 'approved' | 'denied' | 'disbanded'
export type TravelPartyMemberStatus = 'pending' | 'accepted' | 'denied'

export type TokenType =
  | 'player'
  | 'npc'
  | 'enemy'
  | 'object'
  | 'trap'
  | 'door'
  | 'chest'
  | 'book'
  | 'note'
  | 'loot'
  | 'lever'
  | 'switch'
  | 'portal'
  | 'key'
  | 'container'
  | 'custom'

export type ObjectState =
  | 'hidden'
  | 'visible'
  | 'locked'
  | 'unlocked'
  | 'open'
  | 'closed'
  | 'trapped'
  | 'disarmed'
  | 'activated'
  | 'disabled'
  | 'looted'
  | 'broken'
  | 'defeated'
  | 'custom'

export type ResolverType = 'manual' | 'attack' | 'object_state'
export type ResolverStatus =
  | 'idle'
  | 'pending_player'
  | 'rolling'
  | 'applied'
  | 'manual'
  | 'failed'
export type ResponseVisibility = 'actor' | 'public' | 'dm'

export interface Token {
  id: string
  campaign_id: string
  map_id: string
  token_type: TokenType
  name: string
  x: number
  y: number
  size: number
  color: string
  image_url: string | null
  visible_to_players: boolean
  controlled_by_user_id: string | null
  linked_character_id: string | null
  notes: string | null
  movement_locked: boolean
  movement_used: number
  movement_override_allowed: boolean
  last_x: number | null
  last_y: number | null
  interaction_range_feet: number
  available_actions: string[] | null
  hidden_dm_actions: string[] | null
  // Whether players may submit interaction requests for this token at all.
  interactable: boolean
  // DM-controlled state label (locked / open / trapped / looted / ...).
  object_state: string | null
  // For transport ('portal') tokens: the prepared map this token travels to.
  destination_prepared_map_id: string | null
  // PreparedMapToken.id from Adventure Maker JSONB, when this live token was deployed from prep.
  source_prepared_token_id: string | null
  // Hidden from players until a revealed area reaches it, then auto-revealed.
  discoverable: boolean
  // Player-visible flavor text (separate from the DM-only token_dm_notes).
  public_description: string | null
  visible_on_cast: boolean
  requires_approval: boolean
  resolver_type: ResolverType
  resolver_config: Record<string, unknown>
  max_hp: number
  current_hp: number
  temp_hp: number
  armor_class: number
  is_defeated: boolean
  created_at: string
  updated_at: string
}

// First-version fog/reveal layer for the active map. Rows with
// visible_to_players = false are "hidden" markers the DM can re-reveal or
// clear; players never receive those rows (RLS-filtered).
export type RevealedAreaShape = 'full' | 'rectangle' | 'circle'

export interface MapRevealedArea {
  id: string
  campaign_id: string
  map_id: string
  shape_type: RevealedAreaShape
  x: number
  y: number
  width: number | null
  height: number | null
  radius: number | null
  visible_to_players: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export type RoomRegionShapeType = 'rectangle' | 'polygon'
export type RoomRevealMode = 'manual' | 'auto' | 'manual_auto'
export type RoomMaskStyle = 'blackout' | 'dim' | 'outline_only'
export type RoomBorderStyle = 'door' | 'dashed' | 'solid' | 'glow'

export interface RoomRegionPoint {
  x: number
  y: number
}

export interface MapRoomRegion {
  id: string
  campaign_id: string
  map_id: string
  source_prepared_room_id: string | null
  linked_campaign_doc_id: string | null
  name: string
  shape_type: RoomRegionShapeType
  x: number
  y: number
  width: number | null
  height: number | null
  points: RoomRegionPoint[]
  reveal_mode: RoomRevealMode
  mask_style: RoomMaskStyle
  border_style: RoomBorderStyle
  /** Custom border colour (hex); null keeps the border-style default colour. */
  border_color: string | null
  /** Live door-token ids tied to this room (its entrances). */
  door_token_ids: string[]
  player_label_visible: boolean
  auto_reveal_distance_feet: number
  is_revealed: boolean
  visible_to_players: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface MapTravelParty {
  id: string
  campaign_id: string
  map_id: string
  name: string
  created_by: string
  leader_user_id: string
  status: TravelPartyStatus
  dm_response: string | null
  approved_by: string | null
  created_at: string
  updated_at: string
}

export interface MapTravelPartyMember {
  id: string
  party_id: string
  campaign_id: string
  map_id: string
  user_id: string
  status: TravelPartyMemberStatus
  created_at: string
  updated_at: string
}

// A player's current travel confirmation on a map: which transport token they
// want to go through. In group-party mode, unanimous accepted-member agreement
// on one token fires the travel.
export interface MapTransportConfirmation {
  id: string
  campaign_id: string
  map_id: string
  token_id: string
  destination_prepared_map_id: string | null
  user_id: string
  created_at: string
  updated_at: string
}

// A live tabletop session — a campaign-level "we are live" signal the DM starts
// from any live map. At most one row per campaign has status 'active'.
export type CampaignSessionStatus = 'active' | 'ended'

export interface CampaignSession {
  id: string
  campaign_id: string
  status: CampaignSessionStatus
  map_id: string | null
  started_by: string
  started_at: string
  ended_at: string | null
  created_at: string
  updated_at: string
}

// DM-only token notes live in a separate, non-realtime table.
export interface TokenDmNote {
  token_id: string
  campaign_id: string
  content: string | null
  updated_at: string
}

export type EncounterStatus = 'draft' | 'active' | 'completed'
export type ParticipantType = 'player' | 'npc' | 'enemy'

export interface Encounter {
  id: string
  campaign_id: string
  map_id: string | null
  name: string
  status: EncounterStatus
  current_round: number
  current_turn_participant_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface EncounterParticipant {
  id: string
  encounter_id: string
  campaign_id: string
  token_id: string | null
  character_id: string | null
  name: string
  participant_type: ParticipantType
  initiative: number | null
  armor_class: number
  max_hp: number
  current_hp: number
  temp_hp: number
  speed: number
  is_visible_to_players: boolean
  is_defeated: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface EncounterCondition {
  id: string
  participant_id: string
  encounter_id: string
  campaign_id: string
  name: string
  notes: string | null
  created_at: string
}

export interface EncounterParticipantDmNote {
  participant_id: string
  campaign_id: string
  content: string | null
  updated_at: string
}

export interface EncounterParticipantWithConditions extends EncounterParticipant {
  encounter_conditions: EncounterCondition[]
}

export type ActionIntentStatus =
  | 'pending'
  | 'approved_waiting_for_roll'
  | 'rolling'
  | 'rolled_waiting_for_dm'
  | 'approved'
  | 'denied'
  | 'needs_roll'
  | 'resolving'
  | 'resolved'
  | 'cancelled'

export interface ActionIntent {
  id: string
  campaign_id: string
  map_id: string
  encounter_id: string | null
  actor_character_id: string
  actor_user_id: string
  target_token_id: string
  action_type: string
  message: string | null
  selected_tool_type: string | null
  selected_tool_id: string | null
  selected_tool_name: string | null
  status: ActionIntentStatus
  distance_feet: number | null
  range_feet: number | null
  dm_response: string | null
  response_visibility: ResponseVisibility
  resolver_type: ResolverType
  resolver_status: ResolverStatus
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
}

export interface CharacterAttack {
  id: string
  character_id: string
  name: string
  attack_type: 'melee' | 'ranged' | 'spell' | 'custom'
  ability_modifier: AbilityKey | 'custom'
  proficient: boolean
  attack_bonus_override: number | null
  damage_dice: string
  damage_modifier: number
  damage_type: string | null
  range_normal: number | null
  range_long: number | null
  equipped: boolean
  ammo_required: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ActionResult {
  id: string
  action_intent_id: string
  campaign_id: string
  map_id: string | null
  actor_user_id: string
  actor_character_id: string | null
  target_type: string
  target_id: string
  action_type: string
  result_type: string
  result_summary: string | null
  private_dm_details: string | null
  reveal_payload: Record<string, unknown> | null
  public_result: boolean
  created_at: string
}

export interface CombatLog {
  id: string
  campaign_id: string
  map_id: string | null
  encounter_id: string | null
  action_intent_id: string | null
  actor_user_id: string
  actor_character_id: string | null
  target_token_id: string | null
  attack_id: string | null
  d20_roll: number | null
  attack_modifier: number
  attack_total: number | null
  target_ac: number | null
  result: 'hit' | 'miss' | 'manual'
  damage_dice: string | null
  damage_rolls: number[]
  damage_modifier: number
  total_damage: number
  damage_type: string | null
  hp_before: number | null
  hp_after: number | null
  target_defeated: boolean
  created_at: string
}

export interface ActionIntentDmNote {
  intent_id: string
  campaign_id: string
  content: string | null
  updated_at: string
}

export type RollType =
  | 'generic'
  | 'ability_check'
  | 'attack'
  | 'weapon_attack'
  | 'spell_attack'
  | 'skill_check'
  | 'saving_throw'
  | 'tool_check'
  | 'damage'
  | 'custom'

export type AdvantageState = 'normal' | 'advantage' | 'disadvantage'
export type RollRequestStatus = 'waiting_for_player' | 'rolled' | 'cancelled'
export type RollMode = 'manual' | 'automatic'
export type RollResultValue =
  | 'critical_failure'
  | 'failure'
  | 'success'
  | 'major_success'
  | 'critical_success'
  | 'unknown'

export type AttackOutcome = 'critical_miss' | 'miss' | 'hit' | 'critical_hit' | 'unknown'
export type AttackDamageMode = 'automatic' | 'manual' | 'none'

export interface ActionRollRequest {
  id: string
  action_intent_id: string
  campaign_id: string
  character_id: string
  player_id: string
  requested_by_dm_id: string
  label: string
  roll_type: RollType
  modifier: number
  modifier_source: 'manual' | 'calculated' | 'override'
  modifier_breakdown: string[]
  modifier_notes: string[]
  modifier_warnings: string[]
  roll_context: Record<string, unknown>
  target_number: number | null
  target_number_type: 'dc' | 'ac' | 'unknown'
  advantage_state: AdvantageState
  status: RollRequestStatus
  created_at: string
  updated_at: string
}

export interface ActionRollResult {
  id: string
  roll_request_id: string
  action_intent_id: string
  campaign_id: string
  character_id: string
  player_id: string
  roll_mode: RollMode
  natural_roll: number
  second_natural_roll: number | null
  used_natural_roll: number
  modifier: number
  total: number
  target_number: number | null
  result: RollResultValue
  created_at: string
}

export interface ActionAttackResult {
  id: string
  action_intent_id: string
  roll_request_id: string
  campaign_id: string
  character_id: string
  player_id: string
  target_id: string | null
  target_name: string | null
  weapon_name: string
  natural_roll: number
  second_natural_roll: number | null
  used_natural_roll: number
  attack_modifier: number
  attack_total: number
  target_ac_visible: number | null
  outcome: AttackOutcome
  damage_formula: string | null
  damage_dice_rolled: number[]
  damage_modifier: number
  damage_total: number | null
  damage_type: string | null
  critical: boolean
  damage_mode: AttackDamageMode
  player_visible_summary: string
  revealed_to_player: boolean
  created_at: string
}

export interface ActionAttackResultDmDetail {
  attack_result_id: string
  campaign_id: string
  target_ac: number | null
  target_ac_source: string
  dm_summary: string
  created_at: string
}

export type PendingStateUpdateType =
  | 'damage_token'
  | 'heal_token'
  | 'set_token_state'
  | 'set_object_state'
  | 'reveal_object'
  | 'set_awareness'
  | 'custom'

export type PendingStateUpdateTargetKind = 'token' | 'object' | 'room' | 'map' | 'custom'

export type PendingStateUpdateStatus = 'pending_dm_review' | 'applied' | 'rejected'

export interface PendingStateUpdate {
  id: string
  campaign_id: string
  action_intent_id: string | null
  roll_result_id: string | null
  update_type: PendingStateUpdateType
  target_id: string | null
  target_kind: PendingStateUpdateTargetKind
  target_name: string | null
  before: Record<string, unknown>
  after: Record<string, unknown>
  summary: string
  status: PendingStateUpdateStatus
  created_at: string
  applied_at: string | null
  applied_by_dm_id: string | null
}

export type HpEffectKind = 'damage' | 'healing'

export interface ActionHpEffectResult {
  id: string
  action_intent_id: string
  roll_request_id: string
  campaign_id: string
  character_id: string
  player_id: string
  target_id: string | null
  target_name: string | null
  effect_kind: HpEffectKind
  formula: string
  dice_rolled: number[]
  modifier: number
  total: number
  roll_mode: RollMode
  player_visible_summary: string
  created_at: string
}

export interface ActionIntentWithDetails extends ActionIntent {
  actor_character?: Pick<Character, 'id' | 'name' | 'user_id'> | null
  target_token?: Pick<Token, 'id' | 'name' | 'token_type' | 'armor_class' | 'current_hp' | 'max_hp' | 'temp_hp' | 'is_defeated' | 'object_state'> | null
  actor_profile?: Pick<Profile, 'id' | 'display_name'> | null
  action_results?: ActionResult[]
  combat_logs?: CombatLog[]
  action_roll_requests?: ActionRollRequest[]
  action_roll_results?: ActionRollResult[]
  action_attack_results?: ActionAttackResult[]
  action_attack_result_dm_details?: ActionAttackResultDmDetail[]
}

export type PartyMessageType = 'meeting' | 'announcement' | 'whisper' | 'nudge' | 'codex_reveal'
export type PartyMessageDeliveryStatus = 'pending' | 'sent' | 'received' | 'failed'
export type PartyMessageVisibilityLevel = 'players' | 'dm_metadata' | 'private'

export interface PartyMessage {
  id: string
  campaign_id: string
  sender_user_id: string
  recipient_user_id: string | null
  message_type: PartyMessageType
  message: string
  title: string
  sender_name: string | null
  recipient_ids: string[]
  dm_recipient_id: string | null
  visibility_level: PartyMessageVisibilityLevel
  delivery_status: PartyMessageDeliveryStatus
  delivery_log: Record<string, unknown>
  created_at: string
  /** When the DM acknowledged this message (nudges). Null = unhandled. */
  handled_at?: string | null
}

export type QuestStatus = 'hidden' | 'active' | 'completed' | 'failed'
export type NoteVisibility = 'dm' | 'shared'

export interface Quest {
  id: string
  campaign_id: string
  title: string
  status: QuestStatus
  description: string | null
  player_visible_description: string | null
  dm_notes: string | null
  related_npc_ids: string[]
  related_location_ids: string[]
  rewards: string | null
  visible_to_players: boolean
  created_at: string
  updated_at: string
}

export interface StoryLocation {
  id: string
  campaign_id: string
  name: string
  description: string | null
  player_visible_notes: string | null
  dm_notes: string | null
  map_id: string | null
  visible_to_players: boolean
  created_at: string
  updated_at: string
}

export interface Npc {
  id: string
  campaign_id: string
  name: string
  role: string | null
  location_id: string | null
  relationship_to_party: string | null
  player_visible_notes: string | null
  dm_notes: string | null
  portrait_url: string | null
  linked_token_id: string | null
  visible_to_players: boolean
  created_at: string
  updated_at: string
}

export interface StoryNote {
  id: string
  campaign_id: string
  title: string
  content: string | null
  visibility: NoteVisibility
  quest_id: string | null
  npc_id: string | null
  location_id: string | null
  map_id: string | null
  encounter_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Handout {
  id: string
  campaign_id: string
  title: string
  description: string | null
  storage_path: string
  file_type: string | null
  file_size: number | null
  is_revealed: boolean
  quest_id: string | null
  npc_id: string | null
  location_id: string | null
  session_recap_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface SessionRecap {
  id: string
  campaign_id: string
  session_title: string
  session_date: string | null
  what_happened: string | null
  important_npcs: string | null
  locations_visited: string | null
  loot_gained: string | null
  quest_updates: string | null
  open_threads: string | null
  next_session_start: string | null
  dm_follow_up_notes: string | null
  visible_to_players: boolean
  created_at: string
  updated_at: string
}

export type CampaignDocType =
  | 'adventure'
  | 'chapter'
  | 'session'
  | 'location'
  | 'sub_location'
  | 'character'
  | 'npc'
  | 'boss'
  | 'hostile_enemy'
  | 'faction'
  | 'rumor'
  | 'side_quest'
  | 'main_quest'
  | 'item'
  | 'loot'
  | 'handout'
  | 'map_note'
  | 'object_note'

export type CampaignDocVisibility = 'dm_only' | 'player_safe' | 'revealed'
export type CampaignDocSource = 'manual' | 'notion' | 'import'
export type CampaignDocStatus = 'draft' | 'ready' | 'active' | 'archived' | 'stale'
export type CampaignDocRevealState =
  | 'unrevealed'
  | 'partially_revealed'
  | 'revealed'
  | 'retracted'
export type CampaignDocSyncStatus = 'never' | 'success' | 'failed' | 'partial' | 'conflict'
export type CampaignDocRelationType =
  | 'appears_in'
  | 'located_in'
  | 'contains'
  | 'related_to'
  | 'member_of'
  | 'enemy_in'
  | 'npc_in'
  | 'rumor_for'
  | 'quest_hook'
  | 'loot_in'
  | 'map_for'
  | 'object_doc'
  | 'token_doc'
  | 'faction_member'
  | 'session_topic'
export type CampaignDocLiveObjectType =
  | 'map'
  | 'token'
  | 'object'
  | 'prepared_map'
  | 'adventure'
  | 'chapter'
  | 'encounter'
  | 'quest'
  | 'npc'
  | 'location'
  | 'handout'
  | 'other'
export type CodexRevealScope = 'party' | 'player'
export type CodexRevealType = 'manual' | 'map_object' | 'handout' | 'session' | 'sync_safe'

export interface CampaignDoc {
  id: string
  campaign_id: string
  source: CampaignDocSource
  source_page_id: string | null
  source_url: string | null
  source_database_id: string | null
  source_linked_at: string | null
  adventure_id: string | null
  doc_type: CampaignDocType
  title: string
  dm_summary: string | null
  player_summary: string | null
  npc_profile: Record<string, unknown>
  dm_notes: string | null
  tags: string[]
  status: CampaignDocStatus
  visibility: CampaignDocVisibility
  reveal_state: CampaignDocRevealState
  last_synced_at: string | null
  sync_status: CampaignDocSyncStatus
  sync_error: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CampaignDocLink {
  id: string
  campaign_id: string
  source_doc_id: string
  target_doc_id: string | null
  relationship_type: CampaignDocRelationType
  live_object_type: CampaignDocLiveObjectType | null
  live_object_id: string | null
  live_object_label: string | null
  visibility: CampaignDocVisibility
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CodexReveal {
  id: string
  campaign_id: string
  doc_id: string
  revealed_to_scope: CodexRevealScope
  revealed_to_player_id: string | null
  revealed_by: string
  revealed_at: string
  reveal_message: string | null
  reveal_type: CodexRevealType
}

export type NotionTestStatus = 'never' | 'success' | 'failed'

export type NotionAutoSyncStatus = 'never' | 'success' | 'failed' | 'partial'

export interface CampaignNotionConnection {
  campaign_id: string
  access_token: string | null
  is_enabled: boolean
  last_test_status: NotionTestStatus
  last_test_error: string | null
  last_tested_at: string | null
  last_success_at: string | null
  auto_sync_enabled: boolean
  last_webhook_at: string | null
  last_auto_sync_at: string | null
  last_auto_sync_status: NotionAutoSyncStatus
  failed_sync_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type NotionWebhookEventStatus = 'received' | 'processed' | 'ignored' | 'failed'

export interface NotionWebhookEvent {
  id: string
  event_id: string
  campaign_id: string | null
  event_type: string | null
  page_id: string | null
  database_id: string | null
  status: NotionWebhookEventStatus
  message: string | null
  received_at: string
  processed_at: string | null
}

export interface NotionSyncMapping {
  id: string
  campaign_id: string
  notion_database_id: string
  notion_database_name: string | null
  adventure_id: string | null
  doc_type: CampaignDocType
  title_property: string | null
  dm_summary_property: string | null
  player_summary_property: string | null
  dm_notes_property: string | null
  tags_property: string | null
  status_property: string | null
  source_url_property: string | null
  relation_properties: string[]
  enabled: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type NotionSyncLogType = 'doc' | 'database' | 'all'
export type NotionSyncLogStatus = 'success' | 'failed' | 'partial'

export interface NotionSyncLog {
  id: string
  campaign_id: string
  sync_type: NotionSyncLogType
  source_page_id: string | null
  source_database_id: string | null
  status: NotionSyncLogStatus
  message: string | null
  created_count: number
  updated_count: number
  failed_count: number
  started_at: string
  finished_at: string | null
  created_by: string | null
}

export interface PlayerVisibleCampaignDoc {
  id: string
  campaign_id: string
  doc_type: CampaignDocType
  title: string
  player_summary: string | null
  npc_profile: Record<string, unknown>
  tags: string[]
  status: CampaignDocStatus
  visibility: CampaignDocVisibility
  reveal_state: CampaignDocRevealState
  revealed_at: string | null
  reveal_message: string | null
  updated_at: string
}

export interface CampaignDocPublication {
  doc_id: string
  campaign_id: string
  doc_type: CampaignDocType
  title: string
  player_summary: string
  npc_profile: Record<string, unknown>
  tags: string[]
  status: CampaignDocStatus
  visibility: CampaignDocVisibility
  reveal_state: CampaignDocRevealState
  updated_at: string
}

export interface CampaignDocLinkPublication {
  link_id: string
  campaign_id: string
  doc_id: string
  relationship_type: CampaignDocRelationType
  live_object_type: CampaignDocLiveObjectType
  live_object_id: string
  live_object_label: string | null
  updated_at: string
}

export interface CampaignDocWithLinks extends CampaignDoc {
  outgoing_links?: CampaignDocLink[]
  incoming_links?: CampaignDocLink[]
}

export interface HandoutWithUrl extends Handout {
  signed_url: string | null
}

// The tokens table holds no DM-only columns, so player tokens are just tokens.
export type PlayerToken = Token

// Result of the move_token RPC
export interface MoveTokenResult {
  ok?: boolean
  error?: string
  x?: number
  y?: number
  movement_used?: number
  moved_tokens?: number
  max_feet?: number
  attempted_feet?: number
}

export const TOKEN_TYPES: { value: TokenType; label: string; color: string }[] = [
  { value: 'player', label: 'Player', color: '#3b82f6' },
  { value: 'npc', label: 'NPC', color: '#22c55e' },
  { value: 'enemy', label: 'Enemy', color: '#ef4444' },
  { value: 'object', label: 'Object', color: '#a1a1aa' },
  { value: 'trap', label: 'Trap', color: '#f97316' },
  { value: 'door', label: 'Door', color: '#b45309' },
  { value: 'chest', label: 'Chest', color: '#ca8a04' },
  { value: 'book', label: 'Book', color: '#8b5cf6' },
  { value: 'note', label: 'Note', color: '#eab308' },
  { value: 'loot', label: 'Loot Pile', color: '#f59e0b' },
  { value: 'lever', label: 'Lever', color: '#64748b' },
  { value: 'switch', label: 'Switch', color: '#71717a' },
  { value: 'portal', label: 'Portal', color: '#a855f7' },
  { value: 'key', label: 'Key', color: '#fbbf24' },
  { value: 'container', label: 'Container', color: '#92400e' },
  { value: 'custom', label: 'Custom', color: '#6b7280' },
]

export function tokenTypeColor(type: TokenType): string {
  return TOKEN_TYPES.find((t) => t.value === type)?.color ?? '#6b7280'
}

// First-version object states the DM can assign. Free text is also allowed
// (the column is TEXT), this list just powers a quick-pick UI.
export const OBJECT_STATES: { value: ObjectState; label: string }[] = [
  { value: 'visible', label: 'Visible' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'locked', label: 'Locked' },
  { value: 'unlocked', label: 'Unlocked' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'trapped', label: 'Trapped' },
  { value: 'disarmed', label: 'Disarmed' },
  { value: 'activated', label: 'Activated' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'looted', label: 'Looted' },
  { value: 'broken', label: 'Broken' },
  { value: 'defeated', label: 'Defeated' },
  { value: 'custom', label: 'Custom…' },
]

// Suggested player action vocabulary the DM can pick from when configuring
// `available_actions` on a token/object. Free text is also accepted.
export const PLAYER_ACTION_TYPES = [
  'Attack', 'Talk', 'Inspect', 'Search', 'Enter', 'Exit', 'Open', 'Close',
  'Knock', 'Listen', 'Read', 'Take', 'Use Item', 'Lockpick', 'Disarm',
  'Pickpocket', 'Push', 'Pull', 'Activate', 'Break', 'Cast Spell', 'Help',
  'Custom action',
]

// Joined types used in the UI
export interface CampaignWithRole extends Campaign {
  member_role: Role
  member_count: number
}

export interface CampaignMemberWithProfile extends CampaignMember {
  profiles: Profile
}

// Character with owner profile + conditions, used on the DM dashboard
export interface CharacterWithOwner extends Character {
  profiles: Profile | null
  character_conditions: Condition[]
}

// The six ability score keys (note: 'intel' column = Intelligence)
export const ABILITY_KEYS = [
  'str',
  'dex',
  'con',
  'intel',
  'wis',
  'cha',
] as const
export type AbilityKey = (typeof ABILITY_KEYS)[number]

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  intel: 'INT',
  wis: 'WIS',
  cha: 'CHA',
}

// Standard 5e conditions for the quick-pick UI (custom also allowed)
export const STANDARD_CONDITIONS = [
  'Poisoned',
  'Prone',
  'Grappled',
  'Restrained',
  'Frightened',
  'Invisible',
  'Blinded',
  'Stunned',
  'Concentrating',
] as const

// ────────────────────────────────────────────────────────────
// Supabase-generated Database type (manual until `supabase gen types` runs)
// Shape must match exactly what @supabase/supabase-js expects.
// ────────────────────────────────────────────────────────────
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          display_name: string
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          avatar_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          id: string
          name: string
          description: string | null
          owner_id: string
          invite_code: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          owner_id: string
          invite_code?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          owner_id?: string
          invite_code?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      adventures: {
        Row: {
          id: string
          campaign_id: string
          title: string
          description: string | null
          status: string
          prep_notes: Record<string, unknown>[]
          important_links: Record<string, unknown>[]
          tags: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          title: string
          description?: string | null
          status?: string
          prep_notes?: Record<string, unknown>[]
          important_links?: Record<string, unknown>[]
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          title?: string
          description?: string | null
          status?: string
          prep_notes?: Record<string, unknown>[]
          important_links?: Record<string, unknown>[]
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      adventure_chapters: {
        Row: {
          id: string
          adventure_id: string
          campaign_id: string
          title: string
          description: string | null
          sort_order: number
          status: string
          is_live: boolean
          prep_notes: Record<string, unknown>[]
          important_links: Record<string, unknown>[]
          tags: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          adventure_id: string
          campaign_id: string
          title: string
          description?: string | null
          sort_order?: number
          status?: string
          is_live?: boolean
          prep_notes?: Record<string, unknown>[]
          important_links?: Record<string, unknown>[]
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          adventure_id?: string
          campaign_id?: string
          title?: string
          description?: string | null
          sort_order?: number
          status?: string
          is_live?: boolean
          prep_notes?: Record<string, unknown>[]
          important_links?: Record<string, unknown>[]
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      prepared_maps: {
        Row: {
          id: string
          adventure_id: string
          chapter_id: string
          campaign_id: string
          title: string
          description: string | null
          storage_path: string | null
          width: number
          height: number
          grid_enabled: boolean
          grid_size: number
          tokens: Record<string, unknown>[]
          room_regions: Record<string, unknown>[]
          notes: Record<string, unknown>[]
          links: Record<string, unknown>[]
          tags: string[]
          status: string
          is_hub: boolean
          fog_mode: FogMode
          fog_style: FogStyle
          fog_regions: Record<string, unknown>[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          adventure_id: string
          chapter_id: string
          campaign_id: string
          title: string
          description?: string | null
          storage_path?: string | null
          width?: number
          height?: number
          grid_enabled?: boolean
          grid_size?: number
          tokens?: Record<string, unknown>[]
          room_regions?: Record<string, unknown>[]
          notes?: Record<string, unknown>[]
          links?: Record<string, unknown>[]
          tags?: string[]
          status?: string
          is_hub?: boolean
          fog_mode?: FogMode
          fog_style?: FogStyle
          fog_regions?: Record<string, unknown>[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          adventure_id?: string
          chapter_id?: string
          campaign_id?: string
          title?: string
          description?: string | null
          storage_path?: string | null
          width?: number
          height?: number
          grid_enabled?: boolean
          grid_size?: number
          tokens?: Record<string, unknown>[]
          room_regions?: Record<string, unknown>[]
          notes?: Record<string, unknown>[]
          links?: Record<string, unknown>[]
          tags?: string[]
          status?: string
          is_hub?: boolean
          fog_mode?: FogMode
          fog_style?: FogStyle
          fog_regions?: Record<string, unknown>[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaign_docs: {
        Row: CampaignDoc & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          source?: string
          source_page_id?: string | null
          source_url?: string | null
          source_database_id?: string | null
          source_linked_at?: string | null
          adventure_id?: string | null
          doc_type: string
          title: string
          dm_summary?: string | null
          player_summary?: string | null
          npc_profile?: Record<string, unknown>
          dm_notes?: string | null
          tags?: string[]
          status?: string
          visibility?: string
          reveal_state?: string
          last_synced_at?: string | null
          sync_status?: string
          sync_error?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          source?: string
          source_page_id?: string | null
          source_url?: string | null
          source_database_id?: string | null
          source_linked_at?: string | null
          adventure_id?: string | null
          doc_type?: string
          title?: string
          dm_summary?: string | null
          player_summary?: string | null
          npc_profile?: Record<string, unknown>
          dm_notes?: string | null
          tags?: string[]
          status?: string
          visibility?: string
          reveal_state?: string
          last_synced_at?: string | null
          sync_status?: string
          sync_error?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      campaign_doc_links: {
        Row: CampaignDocLink & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          source_doc_id: string
          target_doc_id?: string | null
          relationship_type?: string
          live_object_type?: string | null
          live_object_id?: string | null
          live_object_label?: string | null
          visibility?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          target_doc_id?: string | null
          relationship_type?: string
          live_object_type?: string | null
          live_object_id?: string | null
          live_object_label?: string | null
          visibility?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaign_doc_publications: {
        Row: CampaignDocPublication & Record<string, unknown>
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      campaign_doc_link_publications: {
        Row: CampaignDocLinkPublication & Record<string, unknown>
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      codex_reveals: {
        Row: CodexReveal & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          doc_id: string
          revealed_to_scope?: string
          revealed_to_player_id?: string | null
          revealed_by: string
          revealed_at?: string
          reveal_message?: string | null
          reveal_type?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      campaign_notion_connections: {
        Row: CampaignNotionConnection & Record<string, unknown>
        Insert: {
          campaign_id: string
          access_token?: string | null
          is_enabled?: boolean
          last_test_status?: string
          last_test_error?: string | null
          last_tested_at?: string | null
          last_success_at?: string | null
          auto_sync_enabled?: boolean
          last_webhook_at?: string | null
          last_auto_sync_at?: string | null
          last_auto_sync_status?: string
          failed_sync_count?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          is_enabled?: boolean
          last_test_status?: string
          last_test_error?: string | null
          last_tested_at?: string | null
          last_success_at?: string | null
          auto_sync_enabled?: boolean
          last_webhook_at?: string | null
          last_auto_sync_at?: string | null
          last_auto_sync_status?: string
          failed_sync_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      notion_webhook_events: {
        Row: NotionWebhookEvent & Record<string, unknown>
        Insert: {
          id?: string
          event_id: string
          campaign_id?: string | null
          event_type?: string | null
          page_id?: string | null
          database_id?: string | null
          status?: string
          message?: string | null
          received_at?: string
          processed_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          status?: string
          message?: string | null
          processed_at?: string | null
        }
        Relationships: []
      }
      notion_sync_mappings: {
        Row: NotionSyncMapping & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          notion_database_id: string
          notion_database_name?: string | null
          adventure_id?: string | null
          doc_type: string
          title_property?: string | null
          dm_summary_property?: string | null
          player_summary_property?: string | null
          dm_notes_property?: string | null
          tags_property?: string | null
          status_property?: string | null
          source_url_property?: string | null
          relation_properties?: string[]
          enabled?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          notion_database_name?: string | null
          adventure_id?: string | null
          doc_type?: string
          title_property?: string | null
          dm_summary_property?: string | null
          player_summary_property?: string | null
          dm_notes_property?: string | null
          tags_property?: string | null
          status_property?: string | null
          source_url_property?: string | null
          relation_properties?: string[]
          enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      notion_sync_logs: {
        Row: NotionSyncLog & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          sync_type: string
          source_page_id?: string | null
          source_database_id?: string | null
          status?: string
          message?: string | null
          created_count?: number
          updated_count?: number
          failed_count?: number
          started_at?: string
          finished_at?: string | null
          created_by?: string | null
        }
        Update: {
          status?: string
          message?: string | null
          created_count?: number
          updated_count?: number
          failed_count?: number
          finished_at?: string | null
        }
        Relationships: []
      }
      campaign_members: {
        Row: {
          id: string
          campaign_id: string
          user_id: string
          role: string
          joined_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          user_id: string
          role: string
          joined_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          user_id?: string
          role?: string
          joined_at?: string
        }
        Relationships: []
      }
      characters: {
        Row: {
          id: string
          campaign_id: string
          user_id: string
          name: string
          class: string | null
          level: number
          race: string | null
          background: string | null
          armor_class: number
          max_hp: number
          current_hp: number
          temp_hp: number
          speed: number
          initiative_bonus: number
          passive_perception: number
          proficiency_bonus: number
          str: number
          dex: number
          con: number
          intel: number
          wis: number
          cha: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          user_id: string
          name: string
          class?: string | null
          level?: number
          race?: string | null
          background?: string | null
          armor_class?: number
          max_hp?: number
          current_hp?: number
          temp_hp?: number
          speed?: number
          initiative_bonus?: number
          passive_perception?: number
          proficiency_bonus?: number
          str?: number
          dex?: number
          con?: number
          intel?: number
          wis?: number
          cha?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          class?: string | null
          level?: number
          race?: string | null
          background?: string | null
          armor_class?: number
          max_hp?: number
          current_hp?: number
          temp_hp?: number
          speed?: number
          initiative_bonus?: number
          passive_perception?: number
          proficiency_bonus?: number
          str?: number
          dex?: number
          con?: number
          intel?: number
          wis?: number
          cha?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      character_inventory_items: {
        Row: {
          id: string
          character_id: string
          name: string
          quantity: number
          description: string | null
          equipped: boolean
          magical: boolean
          visible_to_dm: boolean
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          character_id: string
          name: string
          quantity?: number
          description?: string | null
          equipped?: boolean
          magical?: boolean
          visible_to_dm?: boolean
          notes?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          quantity?: number
          description?: string | null
          equipped?: boolean
          magical?: boolean
          visible_to_dm?: boolean
          notes?: string | null
        }
        Relationships: []
      }
      character_spells: {
        Row: {
          id: string
          character_id: string
          name: string
          spell_level: number
          prepared: boolean
          uses: string | null
          description: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          character_id: string
          name: string
          spell_level?: number
          prepared?: boolean
          uses?: string | null
          description?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          spell_level?: number
          prepared?: boolean
          uses?: string | null
          description?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      character_abilities: {
        Row: {
          id: string
          character_id: string
          name: string
          source: string | null
          uses: string | null
          reset_type: string | null
          description: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          character_id: string
          name: string
          source?: string | null
          uses?: string | null
          reset_type?: string | null
          description?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          source?: string | null
          uses?: string | null
          reset_type?: string | null
          description?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      character_conditions: {
        Row: {
          id: string
          character_id: string
          name: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          character_id: string
          name: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      maps: {
        Row: {
          id: string
          campaign_id: string
          name: string
          storage_path: string
          grid_enabled: boolean
          grid_size: number
          grid_scale_feet: number
          grid_color: string
          grid_opacity: number
          grid_line_width: number
          grid_subdivisions: number
          grid_offset_x: number
          grid_offset_y: number
          dm_light_brightness: number
          width: number
          height: number
          is_active: boolean
          player_movement_locked: boolean
          travel_mode: TravelMode
          party_options_locked: boolean
          group_movement_unlimited: boolean
          freeroam_movement_unlimited: boolean
          player_vision_radius_feet: number
          cast_settings: Record<string, unknown>
          combat_round: number
          source_prepared_map_id: string | null
          fog_mode: FogMode
          fog_style: FogStyle
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          name: string
          storage_path: string
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
          width?: number
          height?: number
          is_active?: boolean
          player_movement_locked?: boolean
          travel_mode?: TravelMode
          party_options_locked?: boolean
          group_movement_unlimited?: boolean
          freeroam_movement_unlimited?: boolean
          player_vision_radius_feet?: number
          cast_settings?: Record<string, unknown>
          combat_round?: number
          source_prepared_map_id?: string | null
          fog_mode?: FogMode
          fog_style?: FogStyle
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          storage_path?: string
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
          width?: number
          height?: number
          is_active?: boolean
          player_movement_locked?: boolean
          travel_mode?: TravelMode
          party_options_locked?: boolean
          group_movement_unlimited?: boolean
          freeroam_movement_unlimited?: boolean
          player_vision_radius_feet?: number
          cast_settings?: Record<string, unknown>
          combat_round?: number
          source_prepared_map_id?: string | null
          fog_mode?: FogMode
          fog_style?: FogStyle
          updated_at?: string
        }
        Relationships: []
      }
      tokens: {
        Row: {
          id: string
          campaign_id: string
          map_id: string
          token_type: string
          name: string
          x: number
          y: number
          size: number
          color: string
          image_url: string | null
          visible_to_players: boolean
          controlled_by_user_id: string | null
          linked_character_id: string | null
          notes: string | null
          movement_locked: boolean
          movement_used: number
          movement_override_allowed: boolean
          last_x: number | null
          last_y: number | null
          interaction_range_feet: number
          available_actions: string[] | null
          hidden_dm_actions: string[] | null
          interactable: boolean
          object_state: string | null
          destination_prepared_map_id: string | null
          source_prepared_token_id: string | null
          discoverable: boolean
          public_description: string | null
          visible_on_cast: boolean
          requires_approval: boolean
          resolver_type: string
          resolver_config: Record<string, unknown>
          max_hp: number
          current_hp: number
          temp_hp: number
          armor_class: number
          is_defeated: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          map_id: string
          token_type?: string
          name?: string
          x?: number
          y?: number
          size?: number
          color?: string
          image_url?: string | null
          visible_to_players?: boolean
          controlled_by_user_id?: string | null
          linked_character_id?: string | null
          notes?: string | null
          movement_locked?: boolean
          movement_used?: number
          movement_override_allowed?: boolean
          last_x?: number | null
          last_y?: number | null
          interaction_range_feet?: number
          available_actions?: string[] | null
          hidden_dm_actions?: string[] | null
          interactable?: boolean
          object_state?: string | null
          destination_prepared_map_id?: string | null
          source_prepared_token_id?: string | null
          discoverable?: boolean
          public_description?: string | null
          visible_on_cast?: boolean
          requires_approval?: boolean
          resolver_type?: string
          resolver_config?: Record<string, unknown>
          max_hp?: number
          current_hp?: number
          temp_hp?: number
          armor_class?: number
          is_defeated?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          token_type?: string
          name?: string
          x?: number
          y?: number
          size?: number
          color?: string
          image_url?: string | null
          visible_to_players?: boolean
          controlled_by_user_id?: string | null
          linked_character_id?: string | null
          notes?: string | null
          movement_locked?: boolean
          movement_used?: number
          movement_override_allowed?: boolean
          last_x?: number | null
          last_y?: number | null
          interaction_range_feet?: number
          available_actions?: string[] | null
          hidden_dm_actions?: string[] | null
          interactable?: boolean
          object_state?: string | null
          destination_prepared_map_id?: string | null
          source_prepared_token_id?: string | null
          discoverable?: boolean
          public_description?: string | null
          visible_on_cast?: boolean
          requires_approval?: boolean
          resolver_type?: string
          resolver_config?: Record<string, unknown>
          max_hp?: number
          current_hp?: number
          temp_hp?: number
          armor_class?: number
          is_defeated?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      map_transport_confirmations: {
        Row: {
          id: string
          campaign_id: string
          map_id: string
          token_id: string
          destination_prepared_map_id: string | null
          user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          map_id: string
          token_id: string
          destination_prepared_map_id?: string | null
          user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          token_id?: string
          destination_prepared_map_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      campaign_sessions: {
        Row: {
          id: string
          campaign_id: string
          status: string
          map_id: string | null
          started_by: string
          started_at: string
          ended_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          status?: string
          map_id?: string | null
          started_by: string
          started_at?: string
          ended_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: string
          map_id?: string | null
          ended_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      map_revealed_areas: {
        Row: MapRevealedArea & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          map_id: string
          shape_type?: string
          x?: number
          y?: number
          width?: number | null
          height?: number | null
          radius?: number | null
          visible_to_players?: boolean
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          shape_type?: string
          x?: number
          y?: number
          width?: number | null
          height?: number | null
          radius?: number | null
          visible_to_players?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      map_room_regions: {
        Row: MapRoomRegion & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          map_id: string
          source_prepared_room_id?: string | null
          linked_campaign_doc_id?: string | null
          name?: string
          shape_type?: RoomRegionShapeType
          x?: number
          y?: number
          width?: number | null
          height?: number | null
          points?: RoomRegionPoint[]
          reveal_mode?: RoomRevealMode
          mask_style?: RoomMaskStyle
          border_style?: RoomBorderStyle
          border_color?: string | null
          door_token_ids?: string[]
          player_label_visible?: boolean
          auto_reveal_distance_feet?: number
          is_revealed?: boolean
          visible_to_players?: boolean
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          source_prepared_room_id?: string | null
          linked_campaign_doc_id?: string | null
          name?: string
          shape_type?: RoomRegionShapeType
          x?: number
          y?: number
          width?: number | null
          height?: number | null
          points?: RoomRegionPoint[]
          reveal_mode?: RoomRevealMode
          mask_style?: RoomMaskStyle
          border_style?: RoomBorderStyle
          border_color?: string | null
          door_token_ids?: string[]
          player_label_visible?: boolean
          auto_reveal_distance_feet?: number
          is_revealed?: boolean
          visible_to_players?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      map_travel_parties: {
        Row: MapTravelParty & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          map_id: string
          name?: string
          created_by: string
          leader_user_id: string
          status?: TravelPartyStatus
          dm_response?: string | null
          approved_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          leader_user_id?: string
          status?: TravelPartyStatus
          dm_response?: string | null
          approved_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      map_travel_party_members: {
        Row: MapTravelPartyMember & Record<string, unknown>
        Insert: {
          id?: string
          party_id: string
          campaign_id: string
          map_id: string
          user_id: string
          status?: TravelPartyMemberStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: TravelPartyMemberStatus
          updated_at?: string
        }
        Relationships: []
      }
      token_dm_notes: {
        Row: {
          token_id: string
          campaign_id: string
          content: string | null
          updated_at: string
        }
        Insert: {
          token_id: string
          campaign_id: string
          content?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      encounters: {
        Row: Encounter & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          map_id?: string | null
          name: string
          status?: string
          current_round?: number
          current_turn_participant_id?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          map_id?: string | null
          name?: string
          status?: string
          current_round?: number
          current_turn_participant_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      encounter_participants: {
        Row: EncounterParticipant & Record<string, unknown>
        Insert: {
          id?: string
          encounter_id: string
          campaign_id: string
          token_id?: string | null
          character_id?: string | null
          name: string
          participant_type?: string
          initiative?: number | null
          armor_class?: number
          max_hp?: number
          current_hp?: number
          temp_hp?: number
          speed?: number
          is_visible_to_players?: boolean
          is_defeated?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          token_id?: string | null
          character_id?: string | null
          name?: string
          participant_type?: string
          initiative?: number | null
          armor_class?: number
          max_hp?: number
          current_hp?: number
          temp_hp?: number
          speed?: number
          is_visible_to_players?: boolean
          is_defeated?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      encounter_participant_dm_notes: {
        Row: EncounterParticipantDmNote & Record<string, unknown>
        Insert: {
          participant_id: string
          campaign_id: string
          content?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      encounter_conditions: {
        Row: EncounterCondition & Record<string, unknown>
        Insert: {
          id?: string
          participant_id: string
          encounter_id: string
          campaign_id: string
          name: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      action_intents: {
        Row: ActionIntent & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          map_id: string
          encounter_id?: string | null
          actor_character_id: string
          actor_user_id: string
          target_token_id: string
          action_type: string
          message?: string | null
          selected_tool_type?: string | null
          selected_tool_id?: string | null
          selected_tool_name?: string | null
          status?: string
          distance_feet?: number | null
          range_feet?: number | null
          dm_response?: string | null
          response_visibility?: string
          resolver_type?: string
          resolver_status?: string
          created_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          status?: string
          selected_tool_type?: string | null
          selected_tool_id?: string | null
          selected_tool_name?: string | null
          dm_response?: string | null
          response_visibility?: string
          resolver_type?: string
          resolver_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: []
      }
      action_roll_requests: {
        Row: ActionRollRequest & Record<string, unknown>
        Insert: {
          id?: string
          action_intent_id: string
          campaign_id: string
          character_id: string
          player_id: string
          requested_by_dm_id: string
          label?: string
          roll_type?: string
          modifier?: number
          modifier_source?: string
          modifier_breakdown?: string[]
          modifier_notes?: string[]
          modifier_warnings?: string[]
          roll_context?: Record<string, unknown>
          target_number?: number | null
          target_number_type?: string
          advantage_state?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          label?: string
          roll_type?: string
          modifier?: number
          modifier_source?: string
          modifier_breakdown?: string[]
          modifier_notes?: string[]
          modifier_warnings?: string[]
          roll_context?: Record<string, unknown>
          target_number?: number | null
          target_number_type?: string
          advantage_state?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      action_roll_results: {
        Row: ActionRollResult & Record<string, unknown>
        Insert: {
          id?: string
          roll_request_id: string
          action_intent_id: string
          campaign_id: string
          character_id: string
          player_id: string
          roll_mode: string
          natural_roll: number
          second_natural_roll?: number | null
          used_natural_roll: number
          modifier?: number
          total: number
          target_number?: number | null
          result?: string
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      action_attack_results: {
        Row: ActionAttackResult & Record<string, unknown>
        Insert: {
          id?: string
          action_intent_id: string
          roll_request_id: string
          campaign_id: string
          character_id: string
          player_id: string
          target_id?: string | null
          target_name?: string | null
          weapon_name: string
          natural_roll: number
          second_natural_roll?: number | null
          used_natural_roll: number
          attack_modifier?: number
          attack_total: number
          target_ac_visible?: number | null
          outcome: string
          damage_formula?: string | null
          damage_dice_rolled?: number[]
          damage_modifier?: number
          damage_total?: number | null
          damage_type?: string | null
          critical?: boolean
          damage_mode?: string
          player_visible_summary: string
          revealed_to_player?: boolean
          created_at?: string
        }
        Update: {
          player_visible_summary?: string
          revealed_to_player?: boolean
        }
        Relationships: []
      }
      action_attack_result_dm_details: {
        Row: ActionAttackResultDmDetail & Record<string, unknown>
        Insert: {
          attack_result_id: string
          campaign_id: string
          target_ac?: number | null
          target_ac_source?: string
          dm_summary: string
          created_at?: string
        }
        Update: {
          target_ac?: number | null
          target_ac_source?: string
          dm_summary?: string
        }
        Relationships: []
      }
      action_hp_effect_results: {
        Row: ActionHpEffectResult & Record<string, unknown>
        Insert: {
          id?: string
          action_intent_id: string
          roll_request_id: string
          campaign_id: string
          character_id: string
          player_id: string
          target_id?: string | null
          target_name?: string | null
          effect_kind: string
          formula: string
          dice_rolled?: number[]
          modifier?: number
          total: number
          roll_mode: string
          player_visible_summary: string
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      pending_state_updates: {
        Row: PendingStateUpdate & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          action_intent_id?: string | null
          roll_result_id?: string | null
          update_type: string
          target_id?: string | null
          target_kind?: string
          target_name?: string | null
          before?: Record<string, unknown>
          after?: Record<string, unknown>
          summary: string
          status?: string
          created_at?: string
          applied_at?: string | null
          applied_by_dm_id?: string | null
        }
        Update: {
          update_type?: string
          target_id?: string | null
          target_kind?: string
          target_name?: string | null
          before?: Record<string, unknown>
          after?: Record<string, unknown>
          summary?: string
          status?: string
          applied_at?: string | null
          applied_by_dm_id?: string | null
        }
        Relationships: []
      }
      party_messages: {
        Row: PartyMessage & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          sender_user_id: string
          recipient_user_id?: string | null
          message_type: string
          message: string
          title?: string
          sender_name?: string | null
          recipient_ids?: string[]
          dm_recipient_id?: string | null
          visibility_level?: string
          delivery_status?: string
          delivery_log?: Record<string, unknown>
          created_at?: string
          handled_at?: string | null
        }
        Update: {
          // DM acknowledgement of nudges (migration 20260621220000). The table
          // is otherwise insert-only.
          handled_at?: string | null
        }
        Relationships: []
      }
      character_attacks: {
        Row: CharacterAttack & Record<string, unknown>
        Insert: {
          id?: string
          character_id: string
          name: string
          attack_type?: string
          ability_modifier?: string
          proficient?: boolean
          attack_bonus_override?: number | null
          damage_dice?: string
          damage_modifier?: number
          damage_type?: string | null
          range_normal?: number | null
          range_long?: number | null
          equipped?: boolean
          ammo_required?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          attack_type?: string
          ability_modifier?: string
          proficient?: boolean
          attack_bonus_override?: number | null
          damage_dice?: string
          damage_modifier?: number
          damage_type?: string | null
          range_normal?: number | null
          range_long?: number | null
          equipped?: boolean
          ammo_required?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      action_results: {
        Row: ActionResult & Record<string, unknown>
        Insert: {
          id?: string
          action_intent_id: string
          campaign_id: string
          map_id?: string | null
          actor_user_id: string
          actor_character_id?: string | null
          target_type?: string
          target_id: string
          action_type: string
          result_type?: string
          result_summary?: string | null
          private_dm_details?: string | null
          reveal_payload?: Record<string, unknown> | null
          public_result?: boolean
          created_at?: string
        }
        Update: {
          result_type?: string
          result_summary?: string | null
          private_dm_details?: string | null
          reveal_payload?: Record<string, unknown> | null
          public_result?: boolean
        }
        Relationships: []
      }
      combat_logs: {
        Row: CombatLog & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          map_id?: string | null
          encounter_id?: string | null
          action_intent_id?: string | null
          actor_user_id: string
          actor_character_id?: string | null
          target_token_id?: string | null
          attack_id?: string | null
          d20_roll?: number | null
          attack_modifier?: number
          attack_total?: number | null
          target_ac?: number | null
          result: string
          damage_dice?: string | null
          damage_rolls?: number[]
          damage_modifier?: number
          total_damage?: number
          damage_type?: string | null
          hp_before?: number | null
          hp_after?: number | null
          target_defeated?: boolean
          created_at?: string
        }
        Update: {
          result?: string
          total_damage?: number
          hp_before?: number | null
          hp_after?: number | null
          target_defeated?: boolean
        }
        Relationships: []
      }
      action_intent_dm_notes: {
        Row: ActionIntentDmNote & Record<string, unknown>
        Insert: {
          intent_id: string
          campaign_id: string
          content?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quests: {
        Row: Quest & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          title: string
          status?: string
          description?: string | null
          player_visible_description?: string | null
          dm_notes?: string | null
          related_npc_ids?: string[]
          related_location_ids?: string[]
          rewards?: string | null
          visible_to_players?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          status?: string
          description?: string | null
          player_visible_description?: string | null
          dm_notes?: string | null
          related_npc_ids?: string[]
          related_location_ids?: string[]
          rewards?: string | null
          visible_to_players?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: StoryLocation & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          name: string
          description?: string | null
          player_visible_notes?: string | null
          dm_notes?: string | null
          map_id?: string | null
          visible_to_players?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          player_visible_notes?: string | null
          dm_notes?: string | null
          map_id?: string | null
          visible_to_players?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      npcs: {
        Row: Npc & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          name: string
          role?: string | null
          location_id?: string | null
          relationship_to_party?: string | null
          player_visible_notes?: string | null
          dm_notes?: string | null
          portrait_url?: string | null
          linked_token_id?: string | null
          visible_to_players?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          role?: string | null
          location_id?: string | null
          relationship_to_party?: string | null
          player_visible_notes?: string | null
          dm_notes?: string | null
          portrait_url?: string | null
          linked_token_id?: string | null
          visible_to_players?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      notes: {
        Row: StoryNote & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          title: string
          content?: string | null
          visibility?: string
          quest_id?: string | null
          npc_id?: string | null
          location_id?: string | null
          map_id?: string | null
          encounter_id?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          content?: string | null
          visibility?: string
          quest_id?: string | null
          npc_id?: string | null
          location_id?: string | null
          map_id?: string | null
          encounter_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      handouts: {
        Row: Handout & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          title: string
          description?: string | null
          storage_path: string
          file_type?: string | null
          file_size?: number | null
          is_revealed?: boolean
          quest_id?: string | null
          npc_id?: string | null
          location_id?: string | null
          session_recap_id?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          description?: string | null
          storage_path?: string
          file_type?: string | null
          file_size?: number | null
          is_revealed?: boolean
          quest_id?: string | null
          npc_id?: string | null
          location_id?: string | null
          session_recap_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      session_recaps: {
        Row: SessionRecap & Record<string, unknown>
        Insert: {
          id?: string
          campaign_id: string
          session_title: string
          session_date?: string | null
          what_happened?: string | null
          important_npcs?: string | null
          locations_visited?: string | null
          loot_gained?: string | null
          quest_updates?: string | null
          open_threads?: string | null
          next_session_start?: string | null
          dm_follow_up_notes?: string | null
          visible_to_players?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          session_title?: string
          session_date?: string | null
          what_happened?: string | null
          important_npcs?: string | null
          locations_visited?: string | null
          loot_gained?: string | null
          quest_updates?: string | null
          open_threads?: string | null
          next_session_start?: string | null
          dm_follow_up_notes?: string | null
          visible_to_players?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_campaign_by_invite_code: {
        Args: { code: string }
        Returns: { id: string; name: string }[]
      }
      regenerate_invite_code: {
        Args: { campaign_id: string }
        Returns: string
      }
      is_campaign_member: {
        Args: { cid: string }
        Returns: boolean
      }
      is_campaign_dm: {
        Args: { cid: string }
        Returns: boolean
      }
      character_owner_id: {
        Args: { char_id: string }
        Returns: string
      }
      character_campaign_id: {
        Args: { char_id: string }
        Returns: string
      }
      set_active_map: {
        Args: { p_campaign_id: string; p_map_id: string }
        Returns: undefined
      }
      move_token: {
        Args: { p_token_id: string; p_x: number; p_y: number }
        Returns: MoveTokenResult
      }
      set_map_travel_options: {
        Args: {
          p_map_id: string
          p_travel_mode?: TravelMode | null
          p_party_options_locked?: boolean | null
          p_group_movement_unlimited?: boolean | null
          p_freeroam_movement_unlimited?: boolean | null
          p_player_vision_radius_feet?: number | null
        }
        Returns: MoveTokenResult
      }
      create_travel_party: {
        Args: {
          p_campaign_id: string
          p_map_id: string
          p_name: string
          p_leader_user_id: string
          p_member_user_ids: string[]
        }
        Returns: { ok?: boolean; error?: string; party_id?: string }
      }
      respond_travel_party_invite: {
        Args: { p_party_id: string; p_accepted: boolean }
        Returns: { ok?: boolean; error?: string }
      }
      review_travel_party: {
        Args: { p_party_id: string; p_approved: boolean; p_dm_response?: string | null }
        Returns: { ok?: boolean; error?: string }
      }
      encounter_campaign_id: {
        Args: { enc_id: string }
        Returns: string
      }
      get_player_visible_campaign_docs: {
        Args: { p_campaign_id: string }
        Returns: PlayerVisibleCampaignDoc[]
      }
      get_player_live_map_tokens: {
        Args: { p_map_id: string }
        Returns: PlayerToken[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
