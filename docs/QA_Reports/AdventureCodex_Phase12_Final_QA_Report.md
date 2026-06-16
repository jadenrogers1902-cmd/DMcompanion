# Adventure Codex Phase 12 Final QA Report

Date: 2026-06-13

Scope: Adventure Codex, Notion manual links, Notion API connection, Notion mapping, manual/webhook sync, sync dashboard, realtime bridge, live-map regression, and documentation finalization.

## 1. Executive Summary

Overall health: **Static QA passed. Authenticated multi-session runtime QA is blocked by missing runtime credentials/session.**

What was built:

- Adventure Codex DM workspace and player Revealed Info surface.
- Player-safe publication and reveal model.
- Live-map/prep object links to Codex docs.
- Manual Notion links.
- Server-only Notion connection with service-role access.
- Notion database mapping and preview.
- Manual Notion sync for one doc, one database, or all mappings.
- Optional webhook receiver for auto-sync.
- Realtime refresh for DM/player Codex surfaces and live-map linked-doc panels.
- DM-only Notion Sync Dashboard.

What works, verified in this pass:

- TypeScript, lint, and production build pass.
- Unauthenticated protected routes redirect to `/login`.
- Login page renders core controls.
- Webhook endpoint safely no-ops when `NOTION_WEBHOOK_SECRET` is unset.
- `/campaigns/[id]/codex/sync` is registered in the production build.
- Static code path review confirms player Codex reads use safe projections/RPCs, while DM surfaces use source tables.
- Static code path review confirms Notion token access remains server-side.
- Raw Supabase error messages from Codex actions were replaced with clean user-facing messages.

Major risks:

- Full DM + Player 1 + Player 2 + mobile realtime QA is not verified in this environment because there is no authenticated DM/player browser session and no `E2E_DM_EMAIL`, `E2E_DM_PASSWORD`, or `E2E_CAMPAIGN_ID`.
- Notion runtime QA is not verified because no service-role key, Notion integration token, shared Notion databases, or public webhook deployment were available in this pass.
- Existing live-engine known gaps from prior QA still apply, including missing critical hit/miss handling, no dedicated Cast/Table-display route, and no DM manual override for stuck attack resolution.

Remaining work:

- Apply/verify Supabase migrations 024-030 in the live project.
- Set server-only Notion env vars and run the Notion runtime checklist.
- Run authenticated multi-session QA with DM desktop, Player 1 desktop, Player 2 desktop, player mobile viewport, and cast/table display when available.
- Build a dedicated cast/table display route if still desired.

## 2. Test Coverage

| Area | Result | Evidence |
|---|---|---|
| TypeScript | PASS | `npx.cmd tsc --noEmit` |
| Lint | PASS | `npm.cmd run lint` |
| Production build | PASS | `npm.cmd run build`; `/codex/sync` and `/api/notion/webhook` registered |
| Smoke E2E | PASS | `npx.cmd playwright test tests/e2e/app-smoke.spec.ts` -> 2 passed |
| Authenticated DM action E2E | BLOCKED/SKIPPED | `dm-action-queue.auth.spec.ts` skipped because E2E env vars are missing |
| Protected app routes | PASS | `/dashboard`, `/codex`, `/codex/notion`, `/codex/sync`, `/live-map` returned 307 to `/login` without cookies |
| Webhook disabled mode | PASS | `POST /api/notion/webhook` returned `{"ok":true,"disabled":true}` with no secret |
| Codex create/edit/link/reveal code paths | STATIC PASS | Server actions reviewed; raw DB errors patched |
| Player Codex privacy | STATIC PASS | Player Codex page uses `get_player_visible_campaign_docs`; player map uses safe docs + link publications |
| Notion token exposure | STATIC PASS | Token reads happen in server actions/route handlers via admin client; status returns booleans/timestamps only |
| Notion mapping/sync | STATIC PASS, RUNTIME BLOCKED | Code paths compile; real Notion token/database unavailable |
| Realtime refresh | STATIC PASS, RUNTIME BLOCKED | Subscriptions reviewed; live multi-session unavailable |
| Live engine regression | STATIC PARTIAL, RUNTIME BLOCKED | Build/smoke pass; full gameplay flow requires authenticated campaign sessions |
| Player mobile viewport | BLOCKED | Requires authenticated player session |
| Cast/table display | NOT AVAILABLE | No dedicated cast route exists; existing docs mark it future work |

## 3. Bugs Found and Fixed

### ACQA-001

- Severity: Medium
- Area: Codex security / user-facing errors
- Description: Several Codex server actions returned raw Supabase error messages to UI callers.
- Steps to reproduce: Trigger a database failure in Codex create/update/link/reveal actions, for example by hitting a live schema/RLS/constraint mismatch.
- Root cause: `lib/actions/codex.ts` returned `error.message` directly in multiple paths.
- Fix applied: Replaced raw DB error returns with clean, action-specific user-facing messages while preserving internal error-text checks used for migration compatibility.
- Files changed: `lib/actions/codex.ts`
- Verification result: `rg "return { error: error.message }" lib/actions/codex.ts` has no matches; `tsc`, `lint`, `build`, and smoke E2E pass.

## 4. Realtime Results

Verified by static/code-path review:

- DM Codex workspace refreshes on `campaign_docs`, `campaign_doc_links`, and `codex_reveals`.
- DM live-map editor refreshes Codex linked-doc panels on `campaign_docs` and `campaign_doc_links`.
- Player Codex/Revealed Info watches `campaign_doc_publications` and scoped `codex_reveals`.
- Player live map watches `campaign_doc_publications`, `campaign_doc_link_publications`, `codex_reveals`, map state, tokens, and map reveal areas.
- Reveal notifications flow through `party_messages` and are de-duped by message id in the listener.

Not verified at runtime in this pass:

- DM sees manual Codex edits without refresh.
- DM sees Notion sync results without refresh.
- Player 1 and Player 2 receive scoped reveals in separate sessions.
- Player mobile receives revealed updates without refresh.
- Reconnect/resync behavior after network interruption.
- Duplicate subscription absence under repeated mount/unmount in live browser sessions.

## 5. Privacy Results

Verified by static/code-path review:

- Players cannot access DM-only Codex source tables through the main Codex route; player route uses `get_player_visible_campaign_docs`.
- Players cannot access Notion mapping or sync dashboard routes; those routes redirect non-DMs to `/campaigns/[id]/codex`.
- Player live-map linked Codex docs use `campaign_doc_link_publications` joined with player-visible docs.
- Hidden tokens/objects do not publish linked Codex docs to players unless the object and doc/link are player-safe/revealed.
- Notion token is never returned to the client; connection status returns only booleans and timestamps.
- Manual Notion links are stored on DM-only `campaign_docs` and are not included in player-safe projections.
- Raw Notion page/database ids are not visibly rendered in Codex/Notion dashboard tables.
- Raw Notion webhook payloads are not stored in UI-facing data and are not returned by the route.
- Raw Supabase errors from Codex actions are now hidden behind clean messages.

Blocked runtime privacy tests:

- Player 1 vs Player 2 scoped reveal isolation.
- Hidden token/object live-map privacy in actual browser sessions.
- Player mobile privacy checks.
- Player attempts to deep-link to Notion settings/mapping/sync dashboard while authenticated as player.

## 6. Notion Sync Results

Manual links:

- Static behavior verified: add/edit/remove/open link code paths exist and route through DM-only `campaign_docs`.
- Invalid links return clean message: `This does not look like a valid Notion link.`
- Runtime add/edit/remove/open tests are blocked by missing authenticated DM session.

Notion API connection:

- Static behavior verified: service-role admin client is server-only; missing service-role key degrades to "not configured."
- Runtime no-token/invalid-token/valid-token/page-not-shared/database-not-shared/rate-limit tests are blocked by missing service-role key and Notion integration.

Mapping:

- Static behavior verified: mappings support Locations, Characters, Rumors, Factions, Boss/Enemy and other Codex doc types through `doc_type`.
- Missing/renamed properties produce warnings in mapping/apply logic instead of throwing.
- Relation mapping resolves Notion page ids to existing Codex docs during sync.
- Preview separates DM-only and player-safe fields.
- Runtime mapping against real Notion databases is blocked.

Manual sync:

- Static behavior verified: one doc, one database, and all-database sync actions exist and reuse shared sync core.
- Sync preserves app-owned visibility, reveal state, and live-object links.
- Sync updates title, summaries, tags, status, relations, sync timestamps/status, and logs.
- Failed single-doc fetch writes clean failure state.
- Runtime sync is blocked by missing Notion setup.

Webhook:

- Disabled mode verified over HTTP: returns `{"ok":true,"disabled":true}` when `NOTION_WEBHOOK_SECRET` is unset.
- Static behavior verified: HMAC check, dedup insert, auto-sync gating, and shared sync core path.
- Runtime signed webhook delivery requires public HTTPS deployment and Notion subscription.

## 7. Files Changed

Phase 12 changed:

- `README.md`
- `lib/actions/codex.ts`
- `docs/AdventureCodex_NotionBridge.md`
- `docs/Implementation_Log.md`
- `docs/ChangeLog.md`
- `docs/QA_Reports/AdventureCodex_QA.md`
- `docs/QA_Reports/AdventureCodex_Phase12_Final_QA_Report.md`

Relevant Adventure Codex / Notion feature files reviewed or covered:

- `app/(app)/campaigns/[id]/codex/page.tsx`
- `app/(app)/campaigns/[id]/codex/notion/page.tsx`
- `app/(app)/campaigns/[id]/codex/sync/page.tsx`
- `app/(app)/campaigns/[id]/live-map/page.tsx`
- `app/api/notion/webhook/route.ts`
- `components/codex/AdventureCodexWorkspace.tsx`
- `components/codex/CodexLinkedDocsPanel.tsx`
- `components/codex/CodexRevealControls.tsx`
- `components/codex/NotionMappingManager.tsx`
- `components/codex/NotionSyncDashboard.tsx`
- `components/maps/MapEditor.tsx`
- `components/maps/PlayerMapView.tsx`
- `components/party/PartyMessageListener.tsx`
- `components/settings/NotionSettingsCard.tsx`
- `lib/actions/codex.ts`
- `lib/actions/notion-mappings.ts`
- `lib/actions/notion-settings.ts`
- `lib/actions/notion-sync.ts`
- `lib/notion/client.ts`
- `lib/notion/mapping.ts`
- `lib/notion/sync-core.ts`
- `lib/hooks/useRealtimeRefresh.ts`
- `lib/hooks/useTokenRealtime.ts`
- `lib/supabase/admin.ts`
- `lib/supabase/env.ts`
- `lib/types/database.ts`

## 8. Database Changes

No new Phase 12 migration was added.

Adventure Codex / Notion database changes already in scope:

- `024_adventure_codex_foundation.sql`
  - Tables: `campaign_docs`, `campaign_doc_links`, `campaign_doc_publications`, `campaign_doc_link_publications`, `codex_reveals`
  - Functions/triggers: publication sync, link publication sync, token/map refresh, `get_player_visible_campaign_docs`
  - RLS: DM-only source tables, member-readable player-safe projections, reveal controls
  - Indexes for campaign/type/visibility/status/tags/links/reveals
- `025_codex_reveal_notifications.sql`
  - Adds `codex_reveal` support to `party_messages`
  - Adds scoped member select policy for `codex_reveals`
- `026_codex_notion_manual_link.sql`
  - Adds `campaign_docs.source_linked_at`
- `027_campaign_notion_connections.sql`
  - Adds `campaign_notion_connections` with forced RLS and no authenticated policies
- `028_notion_sync_mappings.sql`
  - Adds `notion_sync_mappings` with DM-only RLS and mapping indexes/triggers
- `029_notion_sync_logs.sql`
  - Adds `notion_sync_logs` with DM-only RLS
- `030_notion_webhooks.sql`
  - Adds webhook status columns to `campaign_notion_connections`
  - Adds `notion_webhook_events` admin-only dedup table

## 9. Documentation Updated

- `docs/AdventureCodex_NotionBridge.md`
  - Added Phase 12 finalization section and rollback note.
  - Re-emphasized Notion as documentation source, Adventure Codex as app-safe cache, and live engine as gameplay authority.
- `docs/Implementation_Log.md`
  - Added Phase 12 QA/finalization entry with gates, blocked runtime scope, bug fix, and risks.
- `docs/ChangeLog.md`
  - Added Phase 12 entry.
- `docs/QA_Reports/AdventureCodex_QA.md`
  - Added Phase 12 checklist and final report link.
- `README.md`
  - Replaced default Next.js scaffold text with Companion architecture principles, verification gates, and documentation pointers.
- `docs/QA_Reports/AdventureCodex_Phase12_Final_QA_Report.md`
  - Added this final report.

## 10. Remaining Issues

Runtime/environment blockers:

- Need authenticated DM, Player 1, Player 2, and mobile sessions.
- Need `E2E_DM_EMAIL`, `E2E_DM_PASSWORD`, and `E2E_CAMPAIGN_ID` for authenticated automated QA.
- Need `SUPABASE_SERVICE_ROLE_KEY`, applied migrations 024-030, and a shared Notion integration/database for Notion runtime QA.
- Need public HTTPS deployment plus `NOTION_WEBHOOK_SECRET` for webhook runtime QA.

Feature/product gaps:

- No dedicated Cast/Table-display route exists yet.
- Live-object attachment from the sync dashboard intentionally routes to the Live Map; object selection remains in existing drawers.
- No internal webhook retry queue/backoff; burst/rate-limit recovery relies on Notion retries.
- Per-field conflict diff is not surfaced; mapping remains the conflict policy.
- Existing combat gaps from prior QA remain: critical hit/miss handling and DM manual override for stuck attack resolution.

Documentation/ops follow-ups:

- Confirm live Supabase migration state before claiming runtime readiness.
- Run the full manual checklist in `AdventureCodex_QA.md` after auth and Notion prerequisites are available.
- Add authenticated Codex/Notion dashboard Playwright specs once stable test users/campaign fixtures exist.
