# Permission Audit Report

## Phase 8 Summary

Status: Static audit complete; runtime two-account verification still recommended after Supabase migrations through `007_story_tools.sql`.

## Existing Protections

- Authenticated app routes are protected by `proxy.ts` and server-side user checks.
- Campaign routes verify membership before loading campaign data.
- DM-only management screens redirect or are role-aware.
- Supabase RLS is the primary data boundary for campaigns, characters, maps, encounters, action intents, and story tools.

## Hidden Data Handling

- Hidden tokens are filtered from player map queries and protected by token RLS.
- Token DM notes live in `token_dm_notes`, separate from realtime-published `tokens`.
- Encounter participant DM notes live in `encounter_participant_dm_notes`.
- Action intent DM notes live in `action_intent_dm_notes`.
- Story player journal queries use explicit select lists that omit DM-only note fields.
- Hidden/revealed story content uses row visibility flags and RLS.
- Handout files are in a private bucket and served through signed URLs only after visible handout rows are loaded.

## Phase 8 Additions

- Campaign export route is DM-only. It checks campaign membership and requires `role = 'dm'`.
- Export includes campaign data and metadata only; handout/map files themselves are not embedded.
- Export route returns `403` for players.
- Story and map token deletion now require browser confirmation.

## Manual Runtime Tests Still Needed

- Player cannot open `/campaigns/[id]/export`.
- Player cannot access campaigns they are not a member of.
- Player cannot see hidden tokens.
- Player cannot see token, encounter, action, or story DM notes.
- Player cannot edit other players' characters.
- Player cannot mutate encounters, reveal handouts, or manage story content.
- DM can access all management tools for their campaign.

## Residual Risks

- Column-level privacy for story DM notes relies on player-facing app queries plus row-level RLS for visibility. Supabase RLS does not hide columns from a row a user can select. A future hardening pass should move quest/NPC/location/session DM notes to separate DM-only tables, matching the token/encounter/action note pattern.
- Full restore/import is not implemented, so exports are backup/reference artifacts only.
