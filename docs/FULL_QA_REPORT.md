# Full QA Report

## 1. Executive Summary

- **Overall status**: The app is functionally solid for an MVP. Core flows (auth, campaign creation/joining, map editor, token system, action-request system, attack resolution, encounters) are implemented and mostly correct. RLS-based security is generally well-designed and enforced at the database layer (not just client-side), with one **High**-severity gap found and fixed.
- **Build status**: `npx tsc --noEmit` ✅ clean, `npm run lint` ✅ clean (no warnings), `npm run build` ✅ succeeds (Next.js 16.2.7 / Turbopack, 23 routes compiled, 3.8s compile + 5.0s typecheck).
- **Major blockers**: None. No build-breaking issues found.
- **Highest-risk issues**:
  1. (Fixed) `campaign_members_insert_self` RLS policy allowed self-escalation to `dm` role via direct REST/RPC calls bypassing the app's `joinCampaign` flow.
  2. (Fixed) Open-redirect via unvalidated `next` query param in the OAuth callback route.
  3. (Documented — High, not yet built) **Critical hit/miss (nat 20 / nat 1) handling is entirely absent** from the attack resolver — a core D&D combat mechanic.
  4. (Documented — feature gap) **No Cast/Table view exists**, despite the data model (`visible_on_cast`, `public_result`, `response_visibility`) being fully wired and "shovel-ready."
  5. (Documented — High) **No `error.tsx` boundaries existed anywhere under the campaign route tree** (now partially fixed — added one at campaign scope).
- **Readiness rating**: **Test-session ready** (see §16 for justification).

## 2. Test Environment

- **Date**: 2026-06-07
- **Branch / commit**: `main` @ `7925a0c` ("Initial commit from Create Next App") — note: working tree has substantial uncommitted feature work (the entire app beyond the Next.js scaffold), confirmed via `git status`.
- **Node**: v24.15.0 / **npm**: 11.14.0
- **Browser**: Claude Preview MCP (Chromium-based automated browser), plus prior live-session manual testing against `localhost:3000` with real DM credentials
- **Viewports tested** (carried over from the prior DM map-layout QA pass that fed into this review): 1024×768, 1280×720, 1366×768, 1440×900, 1536×864, 1920×1080 (DM desktop); 375/390/430/768px (player mobile)
- **Supabase**: Local project referenced via `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` (untracked, correctly gitignored). Migrations 001–010 reviewed at the SQL level; a new migration `011_fix_campaign_member_role_escalation.sql` was added as part of this QA pass.

## 3. Build and Static Checks

| Check | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | ✅ Pass | No type errors, exit 0 |
| `npm run lint` | ✅ Pass | ESLint clean, zero warnings, exit 0 |
| `npm run build` | ✅ Pass | Compiled in 3.8s, typechecked in 5.0s, 23 routes generated, exit 0 |

No warnings were suppressed or ignored. Full route manifest confirms all expected pages compile: `/`, `/login`, `/register`, `/dashboard`, `/join`, `/campaigns/new`, `/campaigns/[id]` and all sub-routes (`actions`, `characters`, `characters/[charId]`, `characters/[charId]/edit`, `characters/new`, `encounters`, `encounters/[encounterId]`, `encounters/new`, `export`, `maps`, `maps/[mapId]`, `maps/new`, `settings`, `story`), plus `/auth/callback` and the manifest/middleware.

## 4. Feature Coverage Matrix

| Area | Status | Notes |
|---|---|---|
| Authentication (register/login/logout/session) | ✅ Working | Solid SSR session pattern via `proxy.ts` middleware; one open-redirect fixed |
| Campaign creation | ✅ Working | Server-side validation, RLS-backed |
| Campaign joining (invite code) | ✅ Working | Duplicate-join prevented; race-condition UX fixed |
| Role separation (DM/Player) | ✅ Working | `is_campaign_dm`/`is_campaign_member` SECURITY DEFINER helpers used consistently |
| Profiles | ✅ Working | Auto-created via DB trigger; minor data-minimization note |
| DM dashboard | ✅ Working | Good cross-linking; minor link-dedup fix applied |
| Player dashboard | ✅ Working | Clean role-gated layout |
| Map upload / map editor | ✅ Working | Verified live; layout/scroll fixes already applied in prior pass |
| Map pan/zoom (cursor-focused) | ✅ Working | Math verified correct; min/max clamped |
| Right-side DM tool panel + independent scroll | ✅ Working | Verified across all 6 desktop viewports (prior pass) |
| Token creation/editing/visibility | ✅ Working | Server-side clamping of numeric fields; RLS-filtered visibility |
| Token context menu / floating add menu | ✅ Working | Solid backgrounds (fixed in prior pass); minor positioning/click-outside gaps documented |
| Revealed map areas / grid settings | ✅ Working | RLS-filtered correctly; persists |
| Player movement lock/unlock + speed-limited movement | ✅ Working | `move_token` RPC validates server-side |
| Universal action system (request → approve → resolve) | ✅ Working (core flow) | See action-type breakdown below |
| Attack/combat resolver | ⚠️ Partially complete | Core math correct; **no crit handling**; no DM override path |
| Token HP/combat tracking | ✅ Working | Damage order, HP floor, defeat state all correct |
| Requests page/queue | ✅ Working | Live-updating, linked from dashboard |
| Realtime / no-refresh updates | ✅ Mostly working | One gap: no reconnect/error handling on dropped sockets |
| Cast / table view | ❌ Not implemented | Confirmed feature gap; data model ready |
| Player mobile view | ✅ Working | Responsive; some touch-target sizing notes |
| DM responsive layout | ✅ Working | Verified across 6 desktop sizes |
| Supabase RLS / Storage / Realtime | ✅ Mostly correct | One High-severity policy gap found and fixed |
| Error/loading/empty states | ⚠️ Partial | `EmptyState`/`notFound()` used well; `error.tsx` boundaries were entirely missing (one added) |
| Documentation | ✅ Mostly accurate | One encoding artifact fixed; docs are honest about pending work |

## 5. Issues Found

| ID | Severity | Area | Issue | Root Cause | Recommended Fix | Status |
|---|---|---|---|---|---|---|
| QA-01 | **High** | Security / RLS | `campaign_members_insert_self` policy let any authenticated user insert a membership row with `role = 'dm'` for any campaign whose UUID they know (visible in URLs), bypassing `joinCampaign`'s hard-coded `role: 'player'` | `WITH CHECK (user_id = auth.uid())` didn't constrain `role` | Add `role` constraint to `WITH CHECK`, allowing `'dm'` only when caller owns the campaign | **Fixed** (migration 011) |
| QA-02 | **Medium** | Security / Auth | Open redirect via unvalidated `next` query param in `/auth/callback` — `new URL(next, origin)` resolves absolute URLs (`next=https://evil.com`) to the external origin | No validation that `next` is a same-origin relative path | Validate `next` matches `^/(?!/)` before using it, default to `/dashboard` otherwise | **Fixed** |
| QA-03 | **Medium** | Campaigns | `joinCampaign` "check-then-insert" is non-atomic; concurrent joins (double-click/two tabs) surface a raw Postgres unique-violation error to the user | Race between existence check and insert | Catch error code `23505` and redirect to the campaign as if already joined | **Fixed** |
| QA-04 | **High** | Combat resolver | No critical hit / critical miss (natural 20 / natural 1) handling in `resolveAttackIntent` — a core D&D 5e mechanic explicitly named in the QA scope | `d20` roll result is never compared to 20 or 1; only compared against AC | Check `d20 === 20` → auto-hit + double damage dice (5e RAW); `d20 === 1` → auto-miss; surface in `combat_logs` | Documented (not fixed — requires resolver logic + UI changes, judged too risky to rush) |
| QA-05 | **High** | Error handling | Zero `error.tsx`/`not-found.tsx` boundaries existed anywhere under `app/(app)/campaigns/**`; only one global `loading.tsx` exists for the whole app shell | No per-route error boundaries authored | Add `error.tsx` at campaign scope (and ideally per-feature `loading.tsx` for data-heavy routes) | **Partially fixed** — added `app/(app)/campaigns/[id]/error.tsx` |
| QA-06 | **Medium** | Map editor UI | No click-outside-to-close for `TokenContextMenu`/`TokenEditPanel`/`TokenAddBubble` — only Escape or explicit buttons close them | No document-level pointerdown listener / backdrop | Add outside-click detection (ref check or transparent backdrop) | Documented |
| QA-07 | **Medium** | Map editor UI | `TokenContextMenu`/`TokenEditPanel` position is computed from the token's *map-space* percentage, not its actual on-screen position after pan/zoom — can clip off-screen on small viewports or extreme zoom | `tokenMenuPosition` clamp uses `selected.x/map.width` percentages, unaware of `MapCanvas`'s internal `scale`/`offset` state | Lift `scale`/`offset` from `MapCanvas` (or expose a screen-coords callback) and position menus from actual rendered token location | Documented |
| QA-08 | **Medium** | Realtime | `useTokenRealtime` has no reconnect/error handling — a dropped websocket (network blip, backgrounded tab) leaves local state permanently stale until manual reload; no `.subscribe((status) => ...)` callback | Hook purely merges incremental payloads with no resync-on-reconnect | Add a subscription status callback that triggers `router.refresh()` or a full refetch on `CHANNEL_ERROR`/`TIMED_OUT`, mirroring `useRealtimeRefresh`'s resync approach | Documented |
| QA-09 | **Medium** | Combat resolver | No DM override/manual-resolution path for in-flight Attack intents — once approved, the flow is locked to player-rolls-it with no DM affordance to adjust dice, force results, or recover from a stuck/disconnected player | `updateActionIntentStatus` only ever sets `resolver_status: 'pending_player'` for attack intents regardless of which DM button is pressed | Add a DM "resolve manually" path that can write `combat_logs`/HP directly for stuck attack intents | Documented |
| QA-10 | **Medium** | Action system | `stateForAction` maps action type → object state with no awareness of token type/context (e.g. approving "Take" on a `door` token sets `object_state: 'looted'`); also contains dead code (`is_defeated: nextState === 'defeated'` is unreachable for non-attack actions) | Naive type-only mapping table | Make the mapping context-aware (consider token type), remove dead `is_defeated` branch for non-attack flows | Documented |
| QA-11 | **Medium** | Action system | Lockpick/Disarm have no roll/DC mechanic — mechanically identical to Open/Activate (instant DM-approval state flip), despite being core skill-check actions | These action types route to the generic `object_state` resolver | Either build a roll/DC mechanic for skill-check actions, or reclassify them as `manual` to avoid implying automation that doesn't exist | Documented |
| QA-12 | **Medium** | Encounters | Server actions in `lib/actions/encounters.ts` (e.g. `addManualParticipant`, `updateParticipant`, `startEncounter`) perform no app-layer `is_campaign_dm` check, relying entirely on RLS | `getUserId()` only fetches the user, never the role | Add explicit role checks for consistent error messages / defense-in-depth (matches the pattern already used in `submitActionIntent`) | Documented |
| QA-13 | **Medium** | UX / Navigation | No link between Map view ↔ Encounters despite both being core session-time tools the DM flips between constantly | Missing cross-links | Add "Start encounter from this scene" on the map editor and "Open active map" in `EncounterManager` | Documented |
| QA-14 | **Medium** | UX / Mobile | DM action-resolution buttons (Approve/Ask Roll/Deny/Resolve) use `size="sm"` (~30px height), below the 44×44px WCAG/iOS touch-target recommendation, cramped 4-in-a-row | Compact button sizing chosen for density | Increase to `size="md"` or stack/wrap on narrow viewports | Documented |
| QA-15 | **Low** | Maps actions | Most mutating actions in `lib/actions/maps.ts` (movement locks, reveal/hide, token delete, etc.) perform no explicit `getUser`/role check, relying entirely on RLS — safe, but produces raw Postgres RLS-violation error text instead of friendly messages | Inconsistent with `createMap`/`revealEntireMap` which do call `getUser` | Add a shared auth/role-check helper for consistent UX | Documented |
| QA-16 | **Low** | Auth / Register | No handling of "email confirmation required" outcome — `register` may redirect to `/dashboard` without an active session if Supabase requires email confirmation | `signUp` result isn't checked for `data.session` | Check for session presence; show "check your email" messaging if absent | Documented |
| QA-17 | **Low** | Campaigns | Campaign owner can remove their own `campaign_members` row via `removeMember`, leaving an inconsistent state (still DM via `owner_id` but absent from the member list) | `campaign_members_delete` RLS permits self-removal unconditionally | Add a UI guard preventing the owner from leaving their own campaign | Documented |
| QA-18 | **Low** | Tokens | No bounds-clamping on token placement/drag — tokens can be dragged to negative coordinates or far outside `map.width`/`map.height` and become hard to find | No min/max clamp in `handleMove`/`updateTokenPosition`/`move_token` | Clamp `x`/`y` to map bounds (with margin) | Documented |
| QA-19 | **Low** | Map editor UI | `TokenAddBubble` and `TokenContextMenu` can visually overlap near the bottom-left corner; both use independent positioning with no mutual-exclusion beyond toggling on open | Hard-coded corner positions, no collision awareness | Reposition / detect overlap and offset one menu | Documented |
| QA-20 | **Low** | Profiles | `profiles_select_authenticated` exposes all display names/avatars globally to any authenticated user (`USING (true)`), allowing enumeration via direct REST queries | Deliberate simplification; no co-member scoping | Scope to co-members if data minimization is desired (low priority — no PII exposed) | Documented (acceptable as-is) |
| QA-21 | **Low** | Encounters | `addTokenParticipant` infers `participant_type` simplistically (anything not `player`/`enemy` → `npc`), so a `trap`/`object`/`chest` token added to an encounter becomes an "NPC" in the initiative tracker | Naive 3-way mapping | Add a 4th category or exclude non-creature token types from quick-add | Documented |
| QA-22 | **Low** | Realtime | `MapEditor` doesn't watch for live changes to the *current* map's metadata (grid settings, name, image) made by a concurrent DM session — could cause two DMs to see divergent grid settings | Only `player_movement_locked` is wired through `onMapChange`; no `useRealtimeRefresh` watch on `maps` | Extend `onMapChange` to sync grid fields, or add a `useRealtimeRefresh` watch scoped to `mapId` | Documented |
| QA-23 | **Low** | Combat resolver | `ability_modifier: 'custom'` on character attacks silently falls back to STR with no UI to actually set a custom value — schema supports it, UI doesn't expose it | `AttackOptionManager` form omits "custom" as a selectable option | Either add the UI input or remove `'custom'` from the DB check constraint | Documented |
| QA-24 | **Low/Visual** | Documentation | `docs/ROADMAP.md` contained UTF-8 mojibake (`âœ…` instead of `✅`) at lines 116-122 | File saved/edited with mismatched encoding at some point | Re-save with correct UTF-8 encoding | **Fixed** |
| QA-25 | **Low** | UX / Navigation | Dashboard "Players" and "Characters" metric cards both linked to `/campaigns/[id]/characters` — redundant destinations that could confuse users expecting different views (member roster vs. character list) | Copy-paste of `href` without differentiating destination | Point "Players" at the member roster (in Settings) instead | **Fixed** |
| QA-26 | **Low** | UX / Navigation | `DMUtilityPanel` quick-link list omitted "Campaign Settings" — a DM mid-session who wants to regenerate the invite code or manage members has to navigate back through the dashboard | Missing entry in the quick-link array | Add a "Campaign Settings" quick link | **Fixed** |
| QA-27 | **Low** | UX / Mobile nav | Mobile bottom nav (`MobileNav.tsx`) omits Encounters and Settings from the DM's quick campaign shortcuts (5-slot bar: Home/Sheet/Map/Act/Journal) | Fixed-width shortcut bar with limited slots | Add an overflow/"More" entry, or rely on a redesigned compact menu | Documented |
| QA-28 | **Low/Visual** | UI polish | Sidebar collapse toggle uses raw `>>`/`Collapse` text instead of an icon, inconsistent with the icon-driven nav above it | Minor styling oversight | Replace with an icon for visual consistency | Documented |
| QA-29 | **Info** | Code cleanliness | `useTokenRealtime`'s `TokenRow` type carries an unused optional `dm_notes` field — DM notes actually live in the separate `token_dm_notes` table and are never selected as part of `tokens`, so this field is always `undefined` | Leftover from the pre-migration-004 schema (when `dm_notes` lived directly on `tokens`) | Remove the dead field for clarity | Documented |
| QA-30 | **Enhancement / Feature gap** | Cast view | No dedicated Cast/Table-display route exists, despite the data model (`visible_on_cast` on tokens, `action_results.public_result`, `response_visibility`) being fully built and currently unused | Feature deferred (honestly documented in `docs/CAST_VIEW_REQUIREMENTS.md`) | Build `app/(app)/campaigns/[id]/cast/page.tsx` consuming the existing player-safe queries/RLS — the groundwork is "shovel-ready" | Documented (not a bug — confirmed pre-existing, honest gap) |

## 6. Resolutions Applied

| Issue ID | Fix Applied | Files Changed | Verification |
|---|---|---|---|
| QA-01 | Replaced `campaign_members_insert_self` RLS policy with one that constrains `role = 'player'` for normal self-joins, and only permits `role = 'dm'` self-inserts when the caller owns the target campaign (`EXISTS` check against `campaigns.owner_id`) | `supabase/migrations/011_fix_campaign_member_role_escalation.sql` (new) | Migration is additive/idempotent (`DROP POLICY IF EXISTS` then re-create); preserves `createCampaign`'s legitimate DM self-insert and `joinCampaign`'s player self-insert. **Needs manual verification**: apply migration to a test Supabase instance and confirm (a) campaign creation still auto-assigns DM role, (b) joining via invite code still works as `player`, (c) a direct `supabase.from('campaign_members').insert({ campaign_id: <other-campaign>, user_id: <self>, role: 'dm' })` from the browser console is now rejected by Postgres |
| QA-02 | Validate `next` redirect target matches `^/(?!/)` (relative, non-protocol-relative path) before passing to `NextResponse.redirect`; default to `/dashboard` otherwise | `app/auth/callback/route.ts` | `npx tsc --noEmit` passes. **Needs manual verification**: hit `/auth/callback?code=...&next=https://evil.com` and confirm redirect lands on `/dashboard`, not the external URL; confirm normal `next=/campaigns/<id>` flows still work |
| QA-03 | Catch Postgres unique-violation (`code === '23505'`) on the `campaign_members` insert and redirect to the campaign as a successful "already joined" outcome instead of surfacing a raw DB error | `lib/actions/campaigns.ts` | `npx tsc --noEmit` passes; logic change is purely additive (only adds a new branch before the generic error return). **Needs manual verification**: simulate concurrent joins (two tabs submitting the same invite code near-simultaneously) |
| QA-05 (partial) | Added a campaign-scoped error boundary with "Try again"/"Return to dashboard" actions, styled consistently with the app's dark theme | `app/(app)/campaigns/[id]/error.tsx` (new) | `npx tsc --noEmit` and `npm run build` both pass (route compiles). **Needs manual verification**: trigger a runtime error inside a campaign sub-route (e.g. throw in a Server/Client Component) and confirm this boundary renders instead of Next's default error page |
| QA-24 | Replaced mojibake `âœ…` sequences with correct `✅` glyphs (UTF-8, no BOM) | `docs/ROADMAP.md` | `Select-String -Pattern "âœ…"` now returns 0 matches; `✅` count increased from 35 → 42 (the 7 corrupted instances were fixed in place) |
| QA-25 | Changed the "Players" dashboard metric to link to `/campaigns/[id]/settings` (where the member roster actually lives) instead of duplicating the "Characters" card's destination | `app/(app)/campaigns/[id]/page.tsx` | Confirmed the `SessionMetric` is inside the `isDM` branch (settings is DM-only), and `settings/page.tsx` renders a `Members` card with the full roster |
| QA-26 | Added a "Campaign Settings" entry to the `DMUtilityPanel` quick-link list | `components/nav/DMUtilityPanel.tsx` | `npx tsc --noEmit` passes; link follows the existing `QuickLink` component pattern |

## 7. Unresolved Issues

| Issue ID | Reason Not Fixed | Recommended Next Step |
|---|---|---|
| QA-04 (crit handling) | Requires non-trivial changes to `resolveAttackIntent`'s roll/damage logic plus UI surfacing in `combat_logs` and the player roll UI — too large/risky to bundle into a QA pass without dedicated testing | Implement nat-20 (auto-hit, double damage dice) / nat-1 (auto-miss) per 5e RAW; add a `combat_logs` flag for crits; surface visually in the UI |
| QA-06 (click-outside-to-close) | Requires careful pointer-event wiring across `MapCanvas`/`MapEditor` to avoid breaking existing pan/drag/click-to-deselect logic — risk of regressions in a well-tuned interaction system | Add a transparent backdrop or document-level listener with ref-based outside-click detection; test thoroughly against pan/drag/draw gestures |
| QA-07 (menu positioning vs zoom/pan) | Requires lifting `scale`/`offset` state out of `MapCanvas` into `MapEditor` (or adding a screen-coordinate callback) — an architectural change to the canvas/editor data flow | Expose `scale`/`offset` (or a `getScreenPosition(tokenId)` callback) from `MapCanvas`; recompute menu position from real screen coordinates |
| QA-08 (realtime reconnect) | Requires adding subscription-status handling and a resync strategy — needs live network-interruption testing to validate | Add `.subscribe((status) => {...})` with `CHANNEL_ERROR`/`TIMED_OUT` handling that triggers `router.refresh()` or a full refetch |
| QA-09 (DM attack override) | Requires new UI + a new server action that can write `combat_logs`/`tokens` HP directly for DM-forced resolutions — a feature addition, not a bug fix | Design and build a "Resolve manually" flow for stuck/disconnected attack intents |
| QA-10/QA-11 (action mechanics) | Game-design decisions needed (should Lockpick/Disarm have DC rolls? should object-state mapping be token-type-aware?) — not safe to guess at | Discuss design intent with the team; then implement context-aware state mapping and/or skill-check mechanics |
| QA-12 (encounter role checks) | Defense-in-depth addition, not a live bug (RLS already protects) — low urgency, deferred to avoid touching many functions in one pass | Add `is_campaign_dm` checks to encounter server actions for consistent error UX |
| QA-13 (map↔encounter links) | UI/workflow feature addition requiring design decisions about where buttons live | Add "Start Encounter from this scene" / "Open Active Map" cross-links |
| QA-14 (touch targets) | Requires a broader pass over `ActionCenter.tsx` button sizing/layout — risk of breaking the dense DM queue layout if rushed | Increase DM resolution-button sizes to `size="md"` with responsive wrapping |
| QA-15/QA-16/QA-17/QA-18/QA-19/QA-21/QA-22/QA-23/QA-27/QA-28/QA-29 | Each is a small, isolated improvement but collectively too many to safely batch into one QA pass without individual testing | Address individually in follow-up tickets; all have clear, scoped fixes described in §5 |
| QA-20 (global profile visibility) | Deliberate design choice (no PII exposed); changing it is a data-model decision, not a bug fix | Confirm with the team whether profile visibility should be scoped to co-members |
| QA-30 (cast view) | Major feature addition (new route, new components, new realtime wiring) — explicitly out of scope for "safe fixes" | Build the cast view as a dedicated feature project; the data model is ready (`visible_on_cast`, `public_result`, `response_visibility`) |

## 8. Realtime / No-Refresh Results

**What works live** (verified via code-level trace of `useTokenRealtime`/`useRealtimeRefresh` against migrations 004/008/009/010, and live-session testing in the prior map-layout QA pass):
- Token added/moved/hidden/revealed — `tokens` table subscription, `map_id=eq.${mapId}` filter (`useTokenRealtime.ts:42`)
- Active map changes — `maps` table subscription + `useRealtimeRefresh` triggering `router.refresh()` in `PlayerMapView`
- Revealed area changes — `map_revealed_areas` subscription, `map_id=eq.${mapId}` filter
- Movement lock/unlock — propagated via `onMapChange`/`player_movement_locked`
- Action requests, approvals/denials, status updates — `ActionCenter` subscribes to `action_intents`, `action_results`, `combat_logs`, `tokens`, `characters`, `character_attacks`, `character_conditions` filtered by `campaign_id`
- Token HP changes — covered by the `tokens` subscription (combat resolution writes directly to `tokens`)
- Player list / campaign join — confirmed table-level realtime publication in migration 009

**What requires refresh / has gaps:**
- **QA-08**: If the realtime websocket drops (network blip, backgrounded tab, Supabase hiccup), `useTokenRealtime` has no reconnection or resync logic — local state goes stale silently until a manual page reload. Suspected root cause: no `.subscribe((status) => ...)` handler. Recommended fix: trigger a refetch/`router.refresh()` on `CHANNEL_ERROR`/`TIMED_OUT`.
- **QA-22**: Map metadata changes (grid settings, name, image) by a second concurrent DM session are not live-synced into an already-open `MapEditor` instance for the same map.
- **QA-27 / R1** (from sub-agent finding): the dashboard's pending-request count badge is computed server-side at render time; if `DMUtilityPanel`/dashboard doesn't itself subscribe to `action_intents` changes, the badge could go stale between navigations — **needs manual verification** (not independently confirmed in this pass).

**Cast screen**: N/A — no cast view exists to test for live updates (see QA-30).

## 9. Permission and Security Results

**DM-only data checks** — Confirmed enforced at the **database (RLS) layer**, not merely client-side:
- `campaigns_select_member`: players cannot query campaigns they're not members of ✅
- `maps_select`: players cannot fetch inactive/draft maps even via direct REST ✅
- `tokens_select`: hidden tokens (`visible_to_players = false`) are filtered server-side; confirmed the player route's `select('*')` returns only visible rows per RLS, not via client-side filtering ✅
- `tokens_update_dm`: **only DMs can UPDATE tokens** — verified there is no separate player UPDATE policy on `tokens`; players can only move their own tokens via the speed-limited `move_token` SECURITY DEFINER RPC, which independently re-validates ownership, locks, and movement budget server-side. (This directly resolves a sub-agent's flagged "potential Critical" concern — confirmed **not exploitable**: the only UPDATE policy on `tokens` is `tokens_update_dm`, gated on `is_campaign_dm`.) ✅
- `dm_notes` privacy: correctly migrated out of `tokens` into a separate `token_dm_notes` table with DM-only RLS — explicitly fixes a realtime-broadcast leak that would otherwise have sent DM notes to player websocket subscribers ✅
- `map_revealed_areas_select`: players see only `visible_to_players = true` areas on the active map; DMs see everything ✅
- `action_intent_dm_notes` / `action_results.private_dm_details`: DM-only via RLS, excluded from player queries ✅
- `action_intents_cancel_actor`: narrowly scoped so a player can only cancel their **own pending** request — cannot self-approve/deny/resolve ✅

**Player visibility checks**:
- Players cannot see hidden tokens, hidden objects, hidden revealed-areas, or DM notes — all enforced via RLS, confirmed by code trace of the actual SELECT queries used in player-facing pages (no over-fetch-then-filter pattern; RLS does the filtering) ✅
- Players cannot move other players'/NPC/enemy tokens — `move_token` RPC checks `controlled_by_user_id = auth.uid()` server-side ✅
- Players cannot modify token visibility, allowed actions, or HP directly — all gated by `tokens_update_dm` ✅
- Players cannot approve/deny/resolve their own requests — `action_intents_cancel_actor` only allows `pending → cancelled` by the actor; all other status transitions require DM (gated elsewhere) ✅

**Cast view safety checks**: N/A — no cast view exists (QA-30).

**RLS / query concerns**:
- **QA-01 (Fixed)**: `campaign_members_insert_self` allowed self-assignment of the `dm` role — the single most significant security finding, now patched via migration 011.
- **QA-20**: `profiles_select_authenticated` uses `USING (true)`, exposing all display names/avatars globally — low severity (no PII), documented as a data-minimization note rather than a bug.
- All other reviewed RLS policies (campaigns, maps, tokens, revealed areas, action_intents, encounters, storage buckets) were independently verified to match application code's table/column expectations and to correctly gate DM-only mutations server-side, providing genuine defense even if a malicious client bypasses the Next.js server actions entirely.

## 10. Responsive Layout Results

**DM desktop/laptop** (1024×768 → 1920×1080): Verified in the prior live QA pass — page-level scroll prevention works (`html.scrollHeight === clientHeight` at every tested size), the right-side tool panel scrolls independently via `min-h-0 flex-1 overflow-y-auto`, the map remains visible at all sizes, cursor-anchored zoom is isolated from page/panel scroll, and the `lg:`/`2xl:` grid breakpoints correctly switch between stacked (narrow) and side-by-side (≥1024px) layouts. TokenContextMenu and TokenAddBubble now render with fully opaque `bg-zinc-950` backgrounds (previously `/95` translucency + backdrop-blur, hard to read against bright maps).

**DM mobile/tablet**: The DM experience is explicitly laptop/tablet-first per `docs/MOBILE_READINESS_REPORT.md`; the mobile bottom nav (`MobileNav.tsx`) provides DM shortcuts but omits Encounters/Settings (QA-27).

**Player mobile** (375/390/430/768px): Verified no horizontal overflow at any tested width (prior pass); `CharacterSheet`/`ActionCenter` use responsive grid/truncation patterns. Some compact controls (DM action buttons, mobile dropdowns) are below the 44px touch-target guideline (QA-14).

**Cast view**: N/A — does not exist.

## 11. Map Editor QA Results

- **Layout**: ✅ Map remains visible at all times; right panel scrolls independently; page never grows taller than the viewport (verified via the `flex-1`/`min-h-0`/`overflow-hidden` chain across `app/(app)/layout.tsx` → map page → `MapEditor` root).
- **Zoom**: ✅ Cursor-focused (`zoomAround` correctly re-derives offset so the world point under the cursor stays fixed); clamped `[0.1, 8]`; non-passive wheel listener with `preventDefault`/`stopPropagation` confirmed to isolate zoom from page scroll.
- **Pan**: ✅ Pointer-capture-based drag with a 3px movement threshold to distinguish click-to-deselect from drag; panning moves only the map, never the page.
- **Add menu**: ✅ Floating `+` bubble visible; menu opens with a fully opaque `bg-zinc-950` background (fixed in prior pass), self-scrolling (`max-h-[calc(100%-1.5rem)] overflow-y-auto`); ⚠️ no click-outside-to-close (QA-06); ⚠️ can visually overlap the context menu near corners (QA-19).
- **Token context menu**: ✅ Opens on token click, opaque background, self-scrolling, closes on Escape (centrally wired in `MapEditor`); ⚠️ positioning is map-percentage-based rather than actual screen-space, risking off-screen clipping at extreme zoom/pan (QA-07); ⚠️ no click-outside-to-close (QA-06).
- **Right panel scrolling**: ✅ Verified independently scrollable across all 6 desktop viewports without affecting map or page scroll.
- **Token editing**: ✅ Name/type/size/visibility/cast-visibility/interactable/allowed-actions/notes/HP all editable and persist after refresh (server actions clamp numeric inputs; RLS enforces DM-only writes); delete works with confirmation dialog.

## 12. Action System QA Results

- **Allowed actions**: ✅ `actionsForToken()` correctly gates on `interactable` and falls back to sensible per-type defaults.
- **Action requests**: ✅ `submitActionIntent` validates token ownership, target visibility, and range server-side before insert.
- **DM approval flow**: ✅ Live queue (`DMActionQueue`) with Approve/Deny/Ask Roll/Resolve, linked from the dashboard with a live pending-count badge.
- **Resolvers — implementation status**:
  | Action type(s) | Status |
  |---|---|
  | Attack | **Fully implemented** (roll, AC compare, damage order/floor/defeat all correct; missing only crits — QA-04) |
  | Open, Close, Lockpick, Disarm, Activate, Use, Use Item, Push, Pull, Break, Take | **Mechanically implemented** but context-blind (QA-10) and, for skill-check actions like Lockpick/Disarm, lack any roll/DC mechanic (QA-11) |
  | Enter, Exit, Talk, Inspect, Help, Pickpocket, Search, Read, Knock, Listen, Avoid, Cast Spell, Custom | **UI-placeholder / DM-narrated only** — routed to a generic `manual` resolver with zero mechanical support |
- **Attack/combat**: damage application order (temp HP first), HP floor at 0, and defeated-state propagation are all **correct and verified by code trace**. Player cannot modify enemy HP directly — confirmed via RLS (`tokens_update_dm` is the only UPDATE policy). Missing: crit handling (QA-04), DM override path (QA-09), functional "custom" ability modifier (QA-23).

## 13. Button/Workflow Linking Recommendations

| Priority | Area | Current Gap | Recommended Button/Link | Expected Improvement |
|---|---|---|---|---|
| High | Map ↔ Encounters | No cross-links between the two most session-critical DM tools | "Start Encounter from this scene" on the map editor; "Open Active Map" inside `EncounterManager` | Removes manual navigation during live play, the highest-friction moment |
| Medium | DM dashboard → Settings | Settings was reachable only from the dashboard header, not from the utility panel quick-links | Added "Campaign Settings" quick link (✅ done — QA-26) | Faster access to invite-code regeneration / member management mid-session |
| Medium | Dashboard metric clarity | "Players" and "Characters" cards linked to the same destination | Point "Players" at the member roster in Settings (✅ done — QA-25) | Each metric now leads somewhere distinct and meaningful |
| Medium | Mobile DM nav | Encounters/Settings unreachable from the 5-slot mobile shortcut bar | Add an overflow/"More" entry to `MobileNav` | DM can manage encounters/settings without detouring through the dashboard |
| Low | Token → Character | No visible "Link Character" / "Create NPC from Token" affordances surfaced contextually in the token editor beyond the existing `linked_character_id` field | Add explicit `Link Character` / `Create NPC from Token` buttons in `TokenEditPanel` | Speeds up the common DM workflow of converting ad-hoc map tokens into persistent NPCs |
| Low | Encounter → Token | `addTokenParticipant` exists but isn't exposed as a one-click "Add Selected Token to Encounter" from the map editor's token context menu | Add an "Add to Encounter" quick action in `TokenContextMenu` (when an active encounter exists) | Removes the need to leave the map view to build initiative order |
| Low | Requests → Map | Action requests reference a target token/object, but there's no "Open Target on Map" jump link from the requests queue | Add a "View on Map" button per request row in `DMActionQueue` linking to `?focus=<tokenId>` on the map route | Lets the DM quickly verify context before approving/denying |
| Enhancement | Cast view | Entirely absent despite ready data model | Build `app/(app)/campaigns/[id]/cast/page.tsx`; add an "Open Cast View" button from the map editor toolbar | Completes the three-role vision (DM / Player / Cast) that the app is explicitly designed around |

## 14. UX Improvement Recommendations

| Priority | Improvement | Reason | Suggested Location |
|---|---|---|---|
| High | Add `error.tsx` boundaries (campaign scope done; consider per-feature too) | Previously zero error boundaries existed below the app shell — any thrown error fell through to Next's generic error page, breaking the app's visual consistency at the worst possible moment (mid-session) | `app/(app)/campaigns/[id]/error.tsx` (✅ added); consider `maps/[mapId]/error.tsx`, `actions/error.tsx` |
| Medium | Increase DM action-resolution button sizes / add wrapping | Four `size="sm"` buttons in a row are cramped and below touch-target guidelines, yet DMs are expected to use tablets per the app's own mobile-readiness doc | `components/actions/ActionCenter.tsx:571-581` |
| Medium | Add click-outside-to-close for floating map editor menus | Standard context-menu convention; current Escape-only behavior can leave stale panels open | `MapEditor.tsx` (TokenContextMenu/TokenAddBubble/TokenEditPanel) |
| Low | Replace sidebar collapse `>>`/text toggle with an icon | Visual inconsistency with the icon-driven nav | `components/nav/Sidebar.tsx:139` |
| Low | Add a guard preventing the campaign owner from removing their own membership | Prevents a confusing inconsistent state (still DM via ownership, but absent from member list) | `lib/actions/campaigns.ts` / Settings member-list UI |
| Low | Clamp token drag/placement to map bounds | Tokens currently can be dragged off-map and become hard to find | `MapCanvas.tsx` drag handler / `move_token` RPC / `updateTokenPosition` |
| Enhancement | Build the Cast/Table view | Data model is fully ready and unused; completes the app's stated three-role vision | New route per `docs/CAST_VIEW_REQUIREMENTS.md` |

## 15. Documentation Updates

**Files updated as part of this QA pass**:
- `docs/ROADMAP.md` — fixed UTF-8 mojibake (`âœ…` → `✅`) at lines ~116-122 (QA-24)
- `docs/FULL_QA_REPORT.md` — this report (new)

**Remaining doc gaps / notes**:
- `docs/CAST_VIEW_REQUIREMENTS.md` and `docs/PHASE_COMPLETION_REPORT.md` are **accurate and honest** about the cast-view gap and pending manual-viewport verification — no misrepresentation found, no update needed.
- `docs/ROLE_PERMISSION_NOTES.md` claims about RLS-gated visibility were spot-checked against the actual migrations and application queries and found to **match implementation** — confirmed correct, no update needed.
- `docs/MOBILE_READINESS_REPORT.md` / `docs/MOBILE_PLAYER_LAYOUT_REQUIREMENTS.md` are consistent with each other and with the code (player branches verified). No update needed.
- Consider adding a short note to `docs/PERMISSION_AUDIT_REPORT.md` documenting the QA-01 finding and fix (the `campaign_members_insert_self` policy gap), since that report's purpose is specifically to track permission-model audits — **recommended follow-up, not performed in this pass** to avoid scope creep into a separate audit document's narrative.

## 16. Final Readiness Rating

**Test-session ready.**

Rationale: All build/type/lint checks pass cleanly, and the core gameplay loop — campaign setup, map editing, token management, action requests, DM approval, and basic combat resolution — is implemented correctly and enforced server-side via RLS (the single significant security gap found, QA-01, has been patched). The app is safe to run a live session with today: players cannot see hidden information, cannot self-escalate privileges (post-fix), cannot cheat movement or combat math, and the DM has all the tools needed to run a scene.

It falls short of "MVP ready" because: (1) a core combat mechanic (critical hits) is missing, which DM/players will notice immediately in actual play; (2) the cast/table view — one of the three roles the app is explicitly designed around — doesn't exist yet; (3) error boundaries were entirely absent below the app shell until this pass (one is now added, but coverage is thin); and (4) several `manual`-resolver action types (Pickpocket, Lockpick, Disarm, etc.) provide no actual game mechanics, just DM-narrated pass-throughs, which may surprise users expecting automation implied by the polished request/approval UI.

None of these are blockers for a DM willing to narrate manually around the gaps — hence "test-session ready" rather than "not ready" or "partially ready."

## 17. Next Recommended Fix Prompt

> **Prompt: Implement critical hit/miss handling and a DM manual-override path in the attack resolver**
>
> In `lib/actions/action-intents.ts`, locate `resolveAttackIntent` (~lines 300-440). The d20 roll (`d20 = rollDie(20)`) is currently only compared against the target's AC to determine hit/miss — it never checks for a natural 20 or natural 1.
>
> 1. Add critical-hit handling: if `d20 === 20`, treat the attack as an automatic hit and **double the number of damage dice rolled** (5e RAW: roll damage dice twice, add modifier once). Add a `critical: true` flag to the result/`combat_logs` entry.
> 2. Add critical-miss handling: if `d20 === 1`, treat the attack as an automatic miss regardless of the total vs. AC. Add a `criticalMiss: true` flag.
> 3. Surface both states in the UI — wherever `combat_logs`/`action_results` are rendered to DM and player (search `ActionCenter.tsx` for where attack results are displayed), show "Critical Hit!"/"Critical Miss!" badges.
> 4. Separately, add a DM "Resolve manually" affordance for in-flight Attack intents that are stuck in `pending_player` (e.g., player disconnected): a new server action that lets the DM directly write a roll result, damage, and HP change to `combat_logs`/`tokens` (gated by `is_campaign_dm`, bypassing the player-roll path), surfaced as a button in `DMActionQueue` (`ActionCenter.tsx` ~lines 584-588) next to the existing Approve/Deny/Ask Roll/Resolve buttons.
> 5. Run `npx tsc --noEmit && npm run lint && npm run build` and manually test: (a) force several attacks until you observe a nat-20 and nat-1 outcome and confirm the damage/log/UI behavior; (b) as DM, manually resolve a stuck attack intent and confirm HP/`combat_logs` update correctly and the player sees the live result.
