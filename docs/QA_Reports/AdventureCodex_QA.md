# Adventure Codex — QA Report

RLS, realtime, and two-browser privacy QA for the Adventure Codex / reveal
system. Static gates run on every phase; runtime checks require Supabase
migrations applied and a live DM + player session.

## Prerequisites

1. Apply migrations in order through `030_notion_webhooks.sql`
   (`024_adventure_codex_foundation.sql`, then `025`–`030`).
   For the Notion connection/mapping/sync (Phases 6–8) also set
   `SUPABASE_SERVICE_ROLE_KEY` server-side, create a Notion internal integration
   to get a token, and share at least one database with that integration. For the
   optional webhook (Phase 10) deploy to a public HTTPS URL, set
   `NOTION_WEBHOOK_SECRET`, and create a Notion webhook subscription to
   `/api/notion/webhook`.
2. One DM account and at least two player accounts in the same campaign.
3. Two browsers/profiles (DM in one, player in another; a third for
   single-player reveal isolation checks).

## Static gates (automated) — Phase 4

| Check | Result |
|-------|--------|
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run lint` | PASS (0 warnings) |
| `npm.cmd run build` | PASS |

## Phase 4 reveal QA checklist (manual, runtime)

### Reveal by doc type (all to "All players")
- [ ] Reveal a **Location** summary → player popup "New location information is available." + appears in Revealed Info.
- [ ] Reveal an **NPC/Character** summary → "New character information is available."
- [ ] Reveal a **Rumor** → "The DM revealed a rumor."
- [ ] Reveal an **Item/Loot** note → "New item details are available."
- [ ] Reveal a **Quest** (main/side) → "New quest information is available."
- [ ] Reveal a **Faction** → "New faction information is available."
- [ ] Reveal a **Handout** → "A new handout is available."
- [ ] Reveal from a **linked map token/object** → player sees it in the map-object "Revealed info" panel.

### Scopes
- [ ] **Reveal to one player only:** target player A. Player A gets popup + Revealed Info entry; player B sees nothing (no popup, not in B's Revealed Info).
- [ ] **Reveal to all players:** both players get popup + entry.
- [ ] Single-player reveal does **not** flip the doc to global `revealed` (verify in DM dashboard the badge stays as set, and player B still can't see it).

### Privacy
- [ ] DM notes never appear in any player view (popup, Revealed Info, map panel).
- [ ] No `doc_id` / Notion id / relation id / raw JSON / DB error text appears in any player-facing surface.
- [ ] Reveal control is disabled / rejects when the doc has no player-safe summary.
- [ ] Hidden/unrevealed docs do not appear for players even if linked to a hidden token (Phase 3 projection still holds).

### Realtime (no refresh)
- [ ] Player popup appears within ~1s of the DM revealing, on any page (global listener).
- [ ] Revealed content appears in the player's Revealed Info panel without a manual refresh.
- [ ] Editing a revealed doc's player summary updates the player's panel live.
- [ ] DM sees inline "Revealed to …" confirmation; DM does not get their own popup.

### Mobile
- [ ] Player reveal popup renders correctly on a narrow viewport (≤430px) and is dismissible.

### Cast / table view
- [ ] N/A until Cast View is implemented; reveals are player-safe by construction and will surface there once Cast View reads the safe projection.

## Phase 5 manual Notion link QA checklist (manual, runtime)

- [ ] Add a valid Notion URL to a **Location** doc → "Notion link saved.", badge shows "Notion linked".
- [ ] Add a valid Notion URL to a **Character** doc.
- [ ] Add a valid Notion URL to a **Rumor** doc.
- [ ] Add a valid Notion URL to a **Faction** doc.
- [ ] **Open in Notion** opens the correct page in a new tab.
- [ ] **Update** the URL on a linked doc; last-linked date refreshes.
- [ ] **Remove** the link → "Notion link removed.", badge returns to "Not linked".
- [ ] Paste an invalid/non-Notion URL → "This does not look like a valid Notion link." (no save).
- [ ] Paste a database URL with `?v=...` → accepted (stored as database id).
- [ ] No raw page/database id is shown anywhere in the UI.
- [ ] **Player** view: a DM-only Notion-linked doc shows no Notion link/URL; revealed docs show only the player-safe summary, never the Notion page.

### Static gates (automated) — Phase 5

| Check | Result |
|-------|--------|
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run lint` | PASS (0 warnings) |
| `npm.cmd run build` | PASS |

## Phase 6 Notion API connection QA checklist (manual, runtime)

- [ ] **Server not configured:** with `SUPABASE_SERVICE_ROLE_KEY` unset, the settings card shows the "not configured" notice and inputs are disabled.
- [ ] **No token configured:** with the key set but no token, status reads "Not connected"; Test is disabled.
- [ ] **Invalid token:** save a bogus token → Test connection → "The Notion connection could not be verified."; status shows `failed`.
- [ ] **Valid token:** save a real integration token → Test → "Notion connection verified."; status shows `success` + last verified time.
- [ ] **Valid token, page/database not shared:** (exercised in the sync phase) a fetch against an unshared page returns "This page is not shared with the Notion integration." — no raw error.
- [ ] **Token never shown:** after saving, the field is empty and the token is never displayed or pre-filled anywhere.
- [ ] **Update token:** entering a new token replaces the stored one and resets test status to "not tested yet".
- [ ] **Disable:** disabling clears the stored token and resets status to "Not connected".
- [ ] **Player access:** a player visiting `/campaigns/[id]/settings` is redirected away; player has no Notion config UI.
- [ ] **Frontend bundle:** `grep` of `.next/static` shows no token value, no `api.notion.com`, no service-role key (only the env-var name in a hint string).
- [ ] **Raw API errors:** no raw Notion error body or HTTP status appears in any user-facing message.

### Static gates (automated) — Phase 6

| Check | Result |
|-------|--------|
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run lint` | PASS (0 warnings) |
| `npm.cmd run build` | PASS |
| Client-bundle leakage scan | PASS (no token / api.notion.com / service-role value) |

## Phase 7 Notion mapping QA checklist (manual, runtime)

- [ ] Load + map a **Locations** database (Name→title, What Happens Here?→DM summary, Tags→tags, relations).
- [ ] Load + map a **Characters** database.
- [ ] Load + map a **Rumors** database (Rumor Description→player summary, Session→status).
- [ ] Load + map a **Factions** database (Lore→DM summary, Motive→DM notes).
- [ ] Load + map a **Bosses & Hostile Enemies** database (Combat Stats→DM notes).
- [ ] **Preview sample record** shows correct DM-only vs player-safe split, tags, status, relations.
- [ ] **Missing property** (map a property that doesn't exist) → preview shows a warning, no crash.
- [ ] **Renamed property** (rename in Notion, re-test) → warning, graceful empty value.
- [ ] Save / edit / delete a mapping; saved list updates.
- [ ] **Player** visiting `/campaigns/[id]/codex/notion` is redirected to the Codex; no mapping UI.
- [ ] Combat-stats mapping lands in DM notes only; nothing combat-related becomes player-visible.

### Static gates (automated) — Phase 7

| Check | Result |
|-------|--------|
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run lint` | PASS (0 warnings) |
| `npm.cmd run build` | PASS (`/codex/notion` route registered) |

## Phase 8 manual sync QA checklist (manual, runtime)

- [ ] Sync one **Location** (single doc + database) → doc created/updated with mapped fields.
- [ ] Sync one **Character**.
- [ ] Sync one **Rumor** (player_summary populated, stays DM-only until revealed).
- [ ] Sync one **Faction**.
- [ ] Sync one **Boss/Enemy** (combat stats land in DM notes only).
- [ ] **Sync a mapped database** → all records upserted; relations linked where targets exist.
- [ ] **Sync all** → aggregate counts across enabled mappings.
- [ ] **Preserve visibility:** set a synced doc to player_safe, re-sync → visibility unchanged.
- [ ] **Preserve reveal state:** reveal a doc, re-sync → still revealed; updated player_summary pushes live to players.
- [ ] **Preserve live links:** link a synced doc to a token/map, re-sync → link intact.
- [ ] **Player view:** players see only revealed/player-safe updates; DM-only synced content stays hidden; nothing auto-revealed.
- [ ] **DM sees updates without refresh** (Codex workspace realtime).
- [ ] **Graceful drift:** rename/remove a mapped property in Notion, re-sync → warning, no crash, existing value preserved.
- [ ] **No live state touched:** token HP/position/initiative/visibility unaffected by any sync.
- [ ] Sync result summary + `notion_sync_logs` row recorded; no raw Notion errors shown.

### Static gates (automated) — Phase 8

| Check | Result |
|-------|--------|
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run lint` | PASS (0 warnings) |
| `npm.cmd run build` | PASS |

## Phase 9 live update QA checklist (manual, multi-session)

Run with DM + Player 1 + Player 2 in three browser sessions.

- [ ] DM edits a Codex record manually → DM dashboard updates live (no refresh).
- [ ] DM syncs Notion while the **DM Codex panel** is open → records update live.
- [ ] DM syncs Notion while a **token/map/object drawer** is open → linked-doc panel updates live.
- [ ] DM syncs Notion while a **player has Revealed Info open** → already-revealed docs update live; unrevealed stay hidden.
- [ ] DM reveals a record (all players) → both players get the popup + Revealed Info entry without refresh.
- [ ] DM reveals to **Player 1 only** → Player 1 updates; Player 2 sees nothing.
- [ ] Edit a revealed doc's player summary → revealed players' panels update live.
- [ ] DM-only / unrevealed updated content never appears for either player.
- [ ] No duplicate reveal notifications (same reveal shows once).
- [ ] Detach/delete a synced doc → DM panels reflect removal on next event.
- [ ] Players are not subscribed to DM-only tables (verify only publication/reveal events drive player refetches).

### Static gates (automated) — Phase 9

| Check | Result |
|-------|--------|
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run lint` | PASS (0 warnings) |
| `npm.cmd run build` | PASS |

## Phase 10 webhook receiver QA checklist (manual, requires deployment)

Requires a hosted HTTPS deployment, `NOTION_WEBHOOK_SECRET` set, a Notion webhook
subscription pointed at `/api/notion/webhook`, and DM auto-sync turned on.

- [ ] **Endpoint receives a test event** → 200 ack.
- [ ] **Verification handshake** (verification_token, no signature) → 200, token not persisted.
- [ ] **Valid signed event** for a synced page → Codex doc updates; `last_webhook_at` / `last_auto_sync_at` advance.
- [ ] **Invalid signature** → 401, no change.
- [ ] **Secret unset** → 200 no-op (manual sync still works).
- [ ] **Unknown/unroutable page** → logged `ignored`, no error to Notion.
- [ ] **Deleted/unshared page** → event `failed`, `failed_sync_count` increments, cached doc preserved.
- [ ] **Duplicate delivery** (same event_id) → skipped, no duplicate doc.
- [ ] **Auto-sync off** → webhook receipt recorded, no sync runs.
- [ ] **Player-safe revealed content** updated by webhook → player panel updates live.
- [ ] **DM-only content** updated by webhook → stays private; nothing auto-revealed.
- [ ] **No live state touched** by any webhook event.
- [ ] DM settings card shows auto-sync on/off, last webhook, last auto-sync status, failed count; **Manual sync now** works.

### Static gates (automated) — Phase 10

| Check | Result |
|-------|--------|
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run lint` | PASS (0 warnings) |
| `npm.cmd run build` | PASS (`/api/notion/webhook` registered) |

## Phase 11 Notion sync dashboard QA checklist (manual, runtime)

- [ ] Dashboard loads with no Notion connection; counts render and sync actions are disabled/gated cleanly.
- [ ] Dashboard loads with manual docs only; manual docs are counted, no Notion-only warnings appear.
- [ ] Dashboard loads with Notion-synced docs; source split, last sync, failed count, and review flags render.
- [ ] Filter by doc type.
- [ ] Filter by source.
- [ ] Filter by sync status.
- [ ] Filter by visibility.
- [ ] Filter by reveal state.
- [ ] Filter by linked/unlinked live-object state.
- [ ] Filter by broken link state.
- [ ] Filter by needs-review state.
- [ ] Retry failed syncs; only failed Notion docs are attempted.
- [ ] Sync selected doc; a single Notion-linked Codex doc updates and logs a result.
- [ ] Sync mapped database; the selected mapping runs and the dashboard refreshes.
- [ ] Sync all; enabled mappings run and dashboard metrics refresh.
- [ ] Open in Notion opens the stored Notion page URL in a new tab.
- [ ] Open Codex doc lands on the selected Codex record via `?doc=`.
- [ ] Attach to live object opens Live Map; final attachment remains in the existing map drawer flow.
- [ ] Review visibility opens the selected Codex record for visibility/reveal edits.
- [ ] Detach broken link clears the broken Notion source fields and reclassifies the doc as manual.
- [ ] Player visiting `/campaigns/[id]/codex/sync` is redirected to `/campaigns/[id]/codex`.
- [ ] Raw Notion API data, source page IDs, source database IDs, webhook payloads, and raw API bodies do not appear.

### Static gates (automated) - Phase 11

| Check | Result |
|-------|--------|
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run lint` | PASS (0 warnings) |
| `npm.cmd run build` | PASS (`/codex/sync` route registered) |
| Browser route check | BLOCKED at `/login`; dev server served `/codex/sync`, authenticated interaction needs a live DM session |

## Phase 12 full QA / regression / documentation finalization

Detailed final report:
`docs/QA_Reports/AdventureCodex_Phase12_Final_QA_Report.md`

### Static gates (automated) - Phase 12

| Check | Result |
|-------|--------|
| `npx.cmd tsc --noEmit` | PASS |
| `npm.cmd run lint` | PASS (0 warnings) |
| `npm.cmd run build` | PASS |
| `npx.cmd playwright test tests/e2e/app-smoke.spec.ts` | PASS (2 tests) |
| `npx.cmd playwright test tests/e2e/dm-action-queue.auth.spec.ts` | SKIPPED (missing `E2E_DM_EMAIL`, `E2E_DM_PASSWORD`, and `E2E_CAMPAIGN_ID`) |
| Protected unauthenticated route checks | PASS: dashboard, Codex, Notion, sync, and live-map routes redirect to `/login` |
| `POST /api/notion/webhook` with no `NOTION_WEBHOOK_SECRET` | PASS: returns disabled no-op JSON |

### Phase 12 runtime coverage status

- BLOCKED: Full DM desktop, Player 1 desktop, Player 2 desktop, and player mobile
  runtime QA requires authenticated sessions and campaign test credentials.
- BLOCKED: Valid-token, invalid-token, unshared-page/database, rate-limit, and
  live Notion sync QA require a configured Notion integration plus shared test
  databases.
- BLOCKED: Webhook runtime delivery requires a public HTTPS deployment and
  `NOTION_WEBHOOK_SECRET`.
- NOT AVAILABLE: Casting/table display was not implemented or available in this
  local pass.

### Phase 12 privacy/security checks

- PASS: Unauthenticated users are redirected away from protected app routes.
- PASS: Webhook disabled mode does not expose payloads or require a secret.
- PASS: Codex action error handling was hardened so raw Supabase messages are
  not returned to UI callers.
- PASS by code review: Notion tokens are server-side only; status actions return
  connection metadata, not token values.
- PASS by code review: Player Codex/live-map reads use player-safe projection
  data rather than DM-owned source rows.

## Notes / known limitations

- Single-player reveal from a live object surfaces on the player's Revealed Info
  page, not the shared party-wide map-object panel (that panel is party-scoped).
- Notification delivery is best-effort and decoupled from the reveal record.
- If migration 025 is not yet applied, `codex_reveal` messages fall back to
  `announcement`/`whisper` so popups still work, and single-player live updates
  fall back to next-navigation refresh.
