# Adventure Codex + Notion Bridge — Change Log

Phase-by-phase change records for the Adventure Codex / Notion bridge work.
Architecture invariant: **Notion is documentation, not the live engine.** Notion
syncs into the app-owned Codex; live gameplay state (positions, HP, initiative,
dice, approvals, fog/reveal, turns) is never owned by Notion.

## Live Map Egress Reduction Pass (2026-06-28)

**What changed.** Swapped live-map image delivery to a stable private app route,
removed center-screen route-refresh live updates, narrowed realtime refresh
recovery behavior, tightened several live-map queries, and added a Supabase
egress verification guide.

**Why.** Live gameplay updates were regenerating signed map URLs and causing
private map assets to be treated like fresh downloads. This pass keeps the
privacy model intact while reducing Storage and Database egress pressure.

**QA performed.** Static checks and browser-network verification still need to
be recorded in the final handoff for this pass.

## Live Map Remediation Pass (2026-06-22)

**What changed.** Added hybrid player action authorization, action-specific DM
nudges, non-destructive reveal-all/hide-all overrides, player-safe center-screen
filtering, realtime reconnect recovery, and focused QA documentation.

**Why.** The QA review found that player action targeting, DM nudges, cast
visibility, and reveal-all behavior were either too broad or confusing during
live play. This pass tightens those flows while preserving the DM-led app model.

**Database changes.**
- `party_messages.action_intent_id`
- `maps.reveal_override`

**QA performed.** `npx.cmd tsc --noEmit` passed. Lint/build status is tracked
in the final implementation handoff for this pass.

**Remaining issues.** Full authenticated DM/player browser QA still requires
`E2E_DM_EMAIL`, `E2E_DM_PASSWORD`, and `E2E_CAMPAIGN_ID`.

## Adventure Maker + Codex Token Builder Rebuild (2026-06-13)

**What changed.** Rebuilt the prepared-map editor into a three-part workspace:
left-side Map Builder Tokens panel, center map canvas, and right-side map
details/cosmetic/settings panel. The old standalone Tokens and Linked Codex Docs
cards were replaced by the new token builder plus per-token Codex entry detail.

**Why.** Adventure Maker should be the DM's map-building surface where cached
Adventure Codex records, including Notion-synced entries, become prepared map
tokens and objects without letting Notion drive live gameplay.

**Files changed.**
- `components/adventures/PreparedMapEditor.tsx`
- `components/adventures/TokenBuilderPanel.tsx`
- `components/adventures/TokenDetailPanel.tsx`
- `components/adventures/token-meta.ts`
- `lib/actions/prepared-maps.ts`
- `lib/types/adventure.ts`
- `docs/AdventureCodex_NotionBridge.md`
- `docs/Implementation_Log.md`
- `docs/ChangeLog.md`
- `docs/QA_Reports/AdventureMaker_Codex_TokenBuilder_QA.md`

**Behavior.** Dynamic tokens can be created from cached Codex records and store a
clean linked Codex doc id plus source label. Static tokens can be added from
quick-add object pills and deploy as player movement-locked live objects. When a
prepared map is sent to the Live Map, linked prepared tokens create
`campaign_doc_links` rows for the new live tokens.

**Database changes.** None.

**QA performed.** `tsc`, `eslint`, `next build`, and `npm run test:e2e` pass.
The e2e run passed 2 smoke tests and skipped 3 authenticated DM tests because
credentials are unset. Browser smoke confirmed login renders and unauthenticated
Adventure Maker editor access redirects to `/login`.

**Remaining issues.** Drag-and-drop placement remains future work; click-to-add
is the supported workflow. Full authenticated DM/player runtime QA remains
pending.

**Rollback.** Revert the files listed above. No migration rollback is required.

## Phase 12 - Full QA / Regression / Documentation Finalization (2026-06-13)

**What changed.** Added a final QA report, updated README/source-of-truth
documentation, and hardened Codex action errors so raw Supabase messages are not
returned to Codex UI callers.

**Why.** Records the real verification state before the next runtime pass:
static gates are green, but full DM/player/Notion runtime coverage still needs
authenticated sessions and live Notion/Supabase prerequisites.

**Files changed.**
- `README.md`
- `lib/actions/codex.ts`
- `docs/AdventureCodex_NotionBridge.md`
- `docs/Implementation_Log.md`
- `docs/ChangeLog.md`
- `docs/QA_Reports/AdventureCodex_QA.md`
- `docs/QA_Reports/AdventureCodex_Phase12_Final_QA_Report.md`

**QA performed.** `tsc`, `eslint`, `next build`, and smoke E2E pass.
Authenticated DM E2E skipped because `E2E_DM_EMAIL`, `E2E_DM_PASSWORD`, and
`E2E_CAMPAIGN_ID` are unset. Protected routes redirect to `/login`; webhook
returns disabled no-op with no `NOTION_WEBHOOK_SECRET`.

**Bug fixed.** ACQA-001: Codex actions no longer return raw Supabase error
messages to UI callers.

**Remaining issues.** Authenticated multi-session QA, Notion runtime QA, webhook
runtime QA, cast/table display, critical hit/miss handling, and DM manual
override for stuck attack resolution remain future work.

**Rollback.** See "Phase 12 rollback" in `docs/AdventureCodex_NotionBridge.md`.

## Phase 11 - Notion Sync Dashboard (2026-06-13)

**What changed.** Added a DM-only sync-health dashboard at
`/campaigns/[id]/codex/sync` with aggregate Codex/Notion metrics, filters,
status badges, and triage actions.

**Why.** Gives DMs a single operational view for Adventure Codex sync health
without exposing Notion internals or moving sync concerns into live gameplay.

**Files changed.**
- `app/(app)/campaigns/[id]/codex/sync/page.tsx` (new)
- `components/codex/NotionSyncDashboard.tsx` (new)
- `components/codex/AdventureCodexWorkspace.tsx`
- `lib/actions/notion-sync.ts`
- `docs/AdventureCodex_NotionBridge.md`
- `docs/Implementation_Log.md`
- `docs/ChangeLog.md`
- `docs/QA_Reports/AdventureCodex_QA.md`

**Dashboard behavior.** Loads with no connection, manual docs only, or synced
docs. Shows totals, source split, broken links, last sync, failed syncs, review
flags, player-safe/revealed/DM-only counts, linked live objects, and unlinked
docs.

**Statuses.** Synced, Needs sync, Failed, Broken link, Not shared with
integration, Mapping missing, DM-only, Player-safe, Revealed, Needs review, and
Manual are derived from existing Codex fields.

**Filters/actions.** Filters by doc type, source, sync status, visibility,
reveal state, linked/unlinked, broken links, needs review, and search. Actions
include sync selected doc, sync mapped database, sync all, retry failed docs,
open Notion, open Codex doc, jump to Live Map for attachment, review visibility,
and detach broken links.

**Security.** DM-only route; players redirect to the normal Codex/Revealed Info
surface. The UI does not display raw Notion payloads, raw source ids, or raw API
bodies.

**QA performed.** `tsc`, `eslint`, and `next build` pass; route registered.
Browser runtime reached `/login`, so authenticated interaction remains pending a
live DM session.

**Known risks.** Live-object attachment still occurs in existing map drawers;
status derivation is conservative; failed sync count is an operational signal,
not a unique failure-id counter.

**Rollback.** See "Phase 11 rollback" in `docs/AdventureCodex_NotionBridge.md`.

## Phase 10 — Optional Notion Webhook Receiver (2026-06-13)

**What changed.** Optional public webhook endpoint (`POST /api/notion/webhook`) so
Notion edits auto-sync into the Codex. DM auto-sync toggle + status (last webhook,
last auto-sync, failed count, manual retry) on the settings card. Sync logic
extracted into a client-agnostic core shared by manual sync and the webhook.

**Why.** Completes the optional auto-sync path while keeping gameplay state and
player visibility app-owned. Off by default.

**Files changed.**
- `supabase/migrations/030_notion_webhooks.sql` (new)
- `lib/notion/sync-core.ts` (new)
- `lib/actions/notion-sync.ts` (refactored to wrappers)
- `app/api/notion/webhook/route.ts` (new)
- `lib/actions/notion-settings.ts`
- `components/settings/NotionSettingsCard.tsx`
- `lib/types/database.ts`
- `.env.example`

**Database changes.** Migration 030: admin-only `notion_webhook_events` (dedup) +
auto-sync status columns on `campaign_notion_connections`.

**Security.** HMAC-SHA256 signature verification (`NOTION_WEBHOOK_SECRET`,
`timingSafeEqual`); verification handshake acked without persisting; disabled
(200 no-op) when unset; no raw payload stored or returned.

**Event handling.** Routes by synced page or parent database id; dedups by
`event_id`; syncs only when auto-sync is on; deleted/unshared pages fail
gracefully (cached doc kept).

**Safety.** Can modify only documentation fields; never token/HP/initiative/dice/
fog/combat/movement/visibility/reveal; never auto-reveals.

**Realtime.** Webhook upserts ride existing `campaign_docs` realtime (Phase 9).

**QA performed.** `tsc`, `eslint`, `next build` pass; route registered.

**Known risks.** New pages without parent info logged `ignored`; no internal
queue (relies on Notion retries); single global secret; needs service-role key.

**Rollback.** Unset `NOTION_WEBHOOK_SECRET` (instant); full revert in
`docs/AdventureCodex_NotionBridge.md`.

## Phase 9 — Live Codex Updates After Sync (2026-06-11)

**What changed.** Codex changes (manual edit, reveal, Notion sync) now update open
DM and player sessions live, including the live-map DM editor's linked-doc
drawers. Player Codex realtime narrowed to player-safe tables only.

**Why.** Closed the last realtime gap (live-map DM drawers were stale until
manual reload after a sync) and stopped players subscribing to DM-only tables.

**Files changed.**
- `components/codex/AdventureCodexWorkspace.tsx` (role-split watch list)
- `components/maps/MapEditor.tsx` (campaign_docs/links refresh)

**Database changes.** None — reuses 024/025 publications + RLS.

**Realtime model.** DM surfaces watch DM-only source tables; player surfaces watch
only `campaign_doc_publications` / `campaign_doc_link_publications` + scoped
`codex_reveals`. `useRealtimeRefresh` re-runs server components (RLS re-applied);
reveal popups via `party_messages`, de-duped by message id. No duplicate
subscriptions; channels cleaned up on unmount.

**Live behaviour.** DM panels/drawers update on sync/edit without refresh;
already-revealed content updates live for players; DM-only/unrevealed content
never reaches players; nothing auto-revealed.

**QA performed.** `tsc`, `eslint`, `next build` pass.

**Known risks.** Debounced refetch coalesces bursts; reconnect resync relies on
Supabase auto-reconnect.

**Rollback.** See "Phase 9 rollback" in `docs/AdventureCodex_NotionBridge.md`.

## Phase 8 — Manual Sync from Notion to Adventure Codex (2026-06-11)

**What changed.** DM-triggered manual sync: one Notion-linked doc, one mapped
database, or all enabled mappings. Upserts `campaign_docs` by Notion page id,
resolves relations into `campaign_doc_links`, logs each run, and shows a result
summary. No webhooks.

**Why.** First safe import path — brings Notion documentation into the app-owned
Codex without ceding gameplay state or player visibility to Notion.

**Files changed.**
- `supabase/migrations/029_notion_sync_logs.sql` (new)
- `lib/notion/mapping.ts` (mapPageToDoc)
- `lib/actions/notion-sync.ts` (new)
- `lib/types/database.ts`
- `components/codex/NotionMappingManager.tsx`
- `components/codex/AdventureCodexWorkspace.tsx`

**Ownership.** Notion wins for *mapped* fields (title, summaries, DM notes, tags);
app preserves `visibility`, `reveal_state`, live links, and unmapped fields. New
docs created DM-only/unrevealed. Upsert key `(campaign, source='notion',
source_page_id)`.

**Conflict.** Mapped → Notion authoritative; missing/renamed property → preserved
+ warning (no throw). No per-field diff recorded.

**Realtime.** Upserts ride existing `campaign_docs`/publication realtime; DM
updates without refresh; players see only already-player-safe/revealed updates;
nothing auto-revealed.

**Safety.** Never writes live gameplay tables, never exposes raw Notion data/DM
notes, never auto-reveals.

**QA performed.** `tsc`, `eslint`, `next build` pass.

**Known risks.** 500-record/run cap (re-run to continue); non-enum Notion status
stored as a `status:` tag; needs Phase 6 connection + Phase 7 mappings.

**Rollback.** See "Phase 8 rollback" in `docs/AdventureCodex_NotionBridge.md`.

## Phase 7 — Notion Mapping to Adventure Codex (2026-06-11)

**What changed.** DM can map each Notion database onto a Codex doc type — choosing
the Notion property for each Codex field (title, DM summary, player-safe summary,
DM notes, tags, status, source URL) plus relation properties — and preview a
sample record before saving.

**Why.** Gives the upcoming sync adapter a structured, DM-defined mapping from the
campaign's existing Notion database shape to DM-only Codex docs.

**Files changed.**
- `supabase/migrations/028_notion_sync_mappings.sql` (new)
- `lib/notion/client.ts` (extractNotionId)
- `lib/notion/mapping.ts` (new)
- `lib/actions/notion-mappings.ts` (new)
- `lib/types/database.ts`
- `components/codex/NotionMappingManager.tsx` (new)
- `app/(app)/campaigns/[id]/codex/notion/page.tsx` (new)
- `components/codex/AdventureCodexWorkspace.tsx`

**Privacy.** Mappings are DM-only (RLS), no secrets. Synced content defaults
DM-only; only an explicit "Player-safe summary" mapping is player-visible. Combat
stats/ability scores map to DM notes only — Notion never controls live combat.

**Relations.** Previewed as "N linked"; resolved into Codex links in the sync phase.

**Graceful failure.** Missing/renamed properties surface as preview warnings, not errors.

**QA performed.** `tsc`, `eslint`, `next build` pass; `/codex/notion` route registered.

**Known issues.** No import yet (config + preview only); needs the Phase 6 connection to Load/Test.

**Rollback.** See "Phase 7 rollback" in `docs/AdventureCodex_NotionBridge.md`.

## Phase 6 — Server-Side Notion API Connection (2026-06-11)

**What changed.** DM-only Notion integration settings (save/update token, test
connection, disable, status), backed by a secure server-side Notion API client
and a server-only secret store. No content is synced yet.

**Why.** Establishes an authenticated, server-only Notion channel for later sync
phases without ever exposing the token to the browser or players.

**Files changed.**
- `supabase/migrations/027_campaign_notion_connections.sql` (new)
- `lib/supabase/env.ts`, `lib/supabase/admin.ts` (new)
- `lib/notion/client.ts` (new)
- `lib/actions/notion-settings.ts` (new)
- `lib/types/database.ts`
- `components/settings/NotionSettingsCard.tsx` (new)
- `app/(app)/campaigns/[id]/settings/page.tsx`
- `.env.example`

**Security model.** Token lives in `campaign_notion_connections` (RLS forced, no
authenticated policies, privileges revoked, not realtime-published). Only the
service-role admin client — used inside DM-gated server actions — can read it.
Status reads return booleans/timestamps only, never the token. All Notion calls
are server-side. Verified the client bundle contains no token, no
`api.notion.com`, and no service-role value.

**Error handling.** Clean user messages for 401/403/404/429/transport; raw API
errors never surfaced.

**QA performed.** `tsc`, `eslint`, `next build` pass; client-bundle leakage scan clean.

**Known risks.** Requires `SUPABASE_SERVICE_ROLE_KEY` (degrades cleanly if unset);
token stored plaintext at rest (server-only, RLS-locked) — future KMS hardening.

**Rollback.** See "Phase 6 rollback" in `docs/AdventureCodex_NotionBridge.md`.

## Phase 5 — Manual Notion Link Support (2026-06-11)

**What changed.** The DM can attach, update, remove, and open a Notion URL on a
Codex doc, and see whether a doc is Notion-linked. No Notion content is fetched —
this is a manual reference ahead of the API sync.

**Why.** Lets docs record their Notion source now, giving the future sync a
mapping and the DM a jump-to-source link.

**Files changed.**
- `supabase/migrations/026_codex_notion_manual_link.sql` (new)
- `lib/types/database.ts`
- `lib/actions/codex.ts`
- `components/codex/AdventureCodexWorkspace.tsx`

**Database changes.** Migration 026 adds nullable `campaign_docs.source_linked_at`.
Other Notion fields already existed (024). No projection/RLS change.

**Validation.** Accepts `notion.so` / `*.notion.site` URLs; best-effort extracts
page id (or database id for `?v=` views). Rejects non-Notion input with "This
does not look like a valid Notion link." Save/remove return "Notion link
saved." / "Notion link removed."

**Privacy.** All Notion fields are DM-only on `campaign_docs` and are excluded
from the player-safe projection and RPC; players never see Notion links — only
the app-cached player-safe summary.

**QA performed.** `tsc`, `eslint`, `next build` all pass.

**Known issues.** Migration 026 must be applied before runtime use; id parsing
is best-effort; Open-in-Notion relies on the DM's own Notion browser auth.

**Rollback.** See "Phase 5 rollback" in `docs/AdventureCodex_NotionBridge.md`.

## Phase 4 — Player-Safe Reveal System (2026-06-11)

**What changed.** The DM can reveal a player-safe Codex doc to all players or to
one player, with an optional note. Players get a live popup and the content
appears in their Revealed Info panel / linked map-object panel with no manual
refresh. DM notes and private metadata never reach players.

**Why.** Phase 2/3 stored and linked Codex docs but reveal was party-only and
silent. Phase 4 makes documentation usable live at the table with explicit,
scoped, privacy-safe reveals.

**Files changed.**
- `supabase/migrations/025_codex_reveal_notifications.sql` (new)
- `lib/types/database.ts`
- `lib/actions/codex.ts`
- `components/codex/CodexRevealControls.tsx` (new)
- `components/codex/AdventureCodexWorkspace.tsx`
- `components/codex/CodexLinkedDocsPanel.tsx`
- `components/party/PartyMessageListener.tsx`
- `components/maps/MapEditor.tsx`
- `components/adventures/PreparedMapEditor.tsx`
- `app/(app)/campaigns/[id]/codex/page.tsx`
- `app/(app)/campaigns/[id]/live-map/[mapId]/page.tsx`
- `app/(app)/campaigns/[id]/adventures/[adventureId]/chapters/[chapterId]/maps/[preparedMapId]/page.tsx`

**Database changes.** Migration 025 only: `party_messages` message_type CHECK
gains `codex_reveal`; new member-scoped SELECT policy
`codex_reveals_select_scoped_member`. No new tables or columns.

**Realtime changes.** Reveal popups flow through the existing `party_messages`
realtime channel. Party reveals push doc/link content via the Phase 2/3
publication tables; single-player reveals push via the now player-readable
`codex_reveals` table (scoped), triggering an RPC refetch.

**QA performed.** `tsc --noEmit`, `eslint`, `next build` all pass. Two-browser
runtime QA pending Supabase migrations 024 + 025 — see
`docs/QA_Reports/AdventureCodex_QA.md`.

**Known risks.** Migrations 024 + 025 must be applied before runtime use;
single-player live-object reveals surface on the player's Revealed Info page, not
the shared party map-object panel; notification delivery is best-effort.

**Rollback.** See "Phase 4 rollback" in `docs/AdventureCodex_NotionBridge.md`.

**Next phase.** Run the two-browser reveal QA, then Notion mapping configuration.

## Phases 0–3 (prior)

See `docs/AdventureCodex_NotionBridge.md` and `docs/Implementation_Log.md` for
the discovery report (Phase 0), architecture spec (Phase 1), Codex foundation +
migration 024 (Phase 2), and live/prep object linking (Phase 3).
