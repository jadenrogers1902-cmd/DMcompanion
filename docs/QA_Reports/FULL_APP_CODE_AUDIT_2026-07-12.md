# Full App, Code, Cost, and Visual Audit

**Feature baseline:** `docs/QA_Reports/OPTION3_THEME_FEATURE_BASELINE.md`
**Audit/remediation date:** 2026-07-13
**Scope:** all 40 baseline features, role/privacy boundaries, application code,
database policies/RPCs, usability, responsive behavior, and normal-use cost risk
**Notion boundary:** source/static inspection only; no live Notion mutation

## Verdict

The audit remediation is implemented in the working tree and the repository
passes its static quality gates. The highest-risk findings were fixed in code
and in migration `20260713041904_player_safe_live_projections.sql`: players and
Center Screen no longer consume mixed-privacy source rows; browser roles can no
longer forge action/roll/travel state; movement is active-map and
current-membership scoped; wall/door and group collision checks are fail-closed;
and retry/caching/query behavior is bounded more carefully.

This is **not a release-verification claim**. The new migration has not been
applied to a disposable or production Supabase project in this audit, and no
authenticated DM + two-player + Center Screen browser fixture or provider usage
dashboard was available. Every authenticated workflow therefore still needs a
coordinated deployed runtime pass before release.

## Evidence labels

- **Static verified:** current route/component/action/policy wiring was inspected
  and the repository gates passed.
- **Baseline browser verified:** public behavior passed on the audited baseline;
  it is not post-remediation authenticated proof.
- **Runtime blocked:** the required signed-in roles, applied migration, fixture,
  visual browser session, or provider dashboard was unavailable.
- Historical QA documents are context only and are not treated as current proof.

## Executed gates

| Gate | Result | Scope |
|---|---|---|
| TypeScript | PASS | `npx.cmd tsc --noEmit` |
| Focused unit contracts | PASS, 11 tests | safe projections, policy revokes, Proxy matching, image caching, wall/door geometry |
| Theme audit | PASS | no non-allowlisted legacy Zinc/Amber utilities |
| ESLint | PASS | repository lint |
| Production build | PASS | Next.js 16.2.7 compile, type validation, and route generation |
| Diff whitespace | PASS | `git diff --check` |
| Public Chromium smoke | PASS on audited baseline only | five login/register/redirect/theme/mobile checks |
| Post-change visual browser pass | BLOCKED | local browser navigation was unavailable in this environment |
| Authenticated multi-role E2E | BLOCKED | DM, Player 1, Player 2, and campaign fixture credentials are absent |
| Applied migration/advisor proof | BLOCKED | no disposable linked Supabase project was authorized |
| Vercel/Supabase usage deltas | BLOCKED | no dashboard session or before/after exports were available |

## Individual feature coverage

Each baseline feature is listed separately. “Static verified / runtime blocked”
means the current implementation and role wiring exist; it does not mean the
deployed interaction completed successfully.

| ID | Status | Current evidence and remaining proof |
|---|---|---|
| SH-01 | Baseline browser verified; runtime error path blocked | Login controls, validation, loading, links, and redirect wiring present; rerun submit success/server failure after deployment. |
| SH-02 | Baseline browser verified; runtime account creation blocked | Registration fields and validation present; use a disposable account post-release. |
| SH-03 | Static verified / runtime blocked | Shell redirects, desktop/mobile nav, logout, loading/error routes, `h-dvh`, and scroll containment inspected; verify signed-in role layouts. |
| SH-04 | Static verified / runtime blocked | Global listeners exist; safe map recovery now uses capped exponential backoff; prove reconnect and duplicate suppression with simultaneous roles. |
| CM-01 | Static verified / runtime blocked | Owned/joined dashboard branches and empty/create/join entry points present; verify fixture card separation. |
| CM-02 | Static verified / runtime blocked | Campaign creation and eight-character join validation present; complete create/join/error scenarios. |
| CM-03 | Static verified / runtime blocked | Campaign overview, member/invite/session actions present; exercise role gates and confirmations. |
| CM-04 | Static verified / runtime blocked | JSON export route and DM authorization present; verify DM download and player `403`. |
| CM-05 | Static verified / runtime blocked | Manifest, safe-area navigation, and degraded messaging present; verify offline/online and portrait/landscape behavior. |
| CH-01 | Static verified / runtime blocked | Owned/party character branches and DM dashboard present; compare DM and player fixture results. |
| CH-02 | Static verified / runtime blocked | Scratch/template create, edit, finalize, and delete paths present; prove Player 1 cannot edit Player 2. |
| CH-03 | Static verified / runtime blocked | Sheet tabs and character actions present; verify persistence and DM-note isolation. |
| EN-01 | Static verified / runtime blocked | Encounter list/create/detail and all participant sources present; create a populated fixture. |
| EN-02 | Static verified / runtime blocked | Turn, initiative, HP, condition, visibility, and note controls present; run a full encounter cycle. |
| ST-01 | Static verified / runtime blocked | All six Story authoring types and handout upload/reveal actions present; handout signing is one five-minute batch; exercise success/error/empty states. |
| ST-02 | Static verified / runtime blocked | Player Journal uses a sanitized Story snapshot/event stream and revealed handout policy; adversarial runtime payload inspection remains required. |
| AC-01 | Static verified / runtime blocked | Validated server-owned submit/cancel flow, target/action/range checks, and mobile tray present; exercise every supported action. |
| AC-02 | Static verified / runtime blocked | DM queue states, response/note, approve/deny/roll/resolve, and accessible clear dialog present; execute seeded transitions. |
| AC-03 | Static verified / runtime blocked | Generic/attack rolls use assigned-request validation, conditional claims, service writes, and rollback; prove private detail/reveal behavior. |
| AC-04 | Static verified / runtime blocked | HP effects and pending suggestions use validated server writes and compensating cleanup; verify exactly-once apply/reject. |
| AC-05 | Static verified / runtime blocked | Nudge, meeting, announcement, whisper, and acknowledgement paths present; verify recipient isolation and no duplicates. |
| AM-01 | Static verified / runtime blocked | Adventure/chapter create/update/delete/reorder/live paths present; exercise long lists and confirmations. |
| AM-02 | Static verified / runtime blocked | Prep fields for adventure/chapter/map present; save/reload long content. |
| AM-03 | Static verified / runtime blocked | Prepared image/grid/room/fog/wall/token/portal/autosave tools present; open and persist every control group. |
| AM-04 | Static verified / runtime blocked | Token builder, Codex links, static/dynamic metadata, and optional SRD lookup present; verify all classes and private fields. |
| AM-05 | Static verified / runtime blocked | Hub and deployment choices present; exercise each exposed deployment mode and warning. |
| LM-01 | Static verified / runtime blocked | Upload/list/delete/activate/session/grid paths present; map activation is now transactional; verify second-context updates. |
| LM-02 | Static verified / runtime blocked | Token CRUD, filters, visibility, movement/combat/action settings, and DM notes present; verify all save/error states. |
| LM-03 | Static verified / runtime blocked | Fog overrides, areas, rooms, doors, walls, light, and cast settings present; door gaps now apply only near the actual crossing. |
| LM-04 | Static verified / runtime blocked | Party, locks, travel, portal, confirmation, and discovery paths present; direct forged party/confirmation writes are closed. |
| LM-05 | Static verified / runtime blocked | Active-map snapshot, owned visible-token movement, range/lock/wall rules, and action tray present; verify phone/landscape plus adversarial old/hidden token IDs. |
| LM-06 | Static verified / runtime blocked | Character/party/travel/Codex drawers present; verify scroll, focus, and reachable close/back controls with long content. |
| LM-07 | Static verified / runtime blocked | Center Screen consumes DM-scoped revision events and sanitized snapshots, including inactive preview; inspect deployed network/DOM for forbidden fields. |
| LM-08 | Static verified / runtime blocked | Transaction-coalesced revision events, direct snapshot updates, and capped reconnect behavior present; run DM + two players + Center disconnect/reconnect. |
| CX-01 | Static verified / runtime blocked | Manual/Notion-backed Codex CRUD, search/filter/status/type/source paths present; exercise fixture states. |
| CX-02 | Static verified / runtime blocked | Relations, live/prepared links, unlink, party/player reveal paths present; verify targeted scopes. |
| CX-03 | Static verified / runtime blocked | Players consume publications/RPCs rather than DM source rows; run direct source-table denial and targeted reveal tests. |
| NT-01 | Static/mocked only | Token save/test/disable and auto-sync status present; live secret-handling proof intentionally deferred. |
| NT-02 | Static/mocked only | Discovery, schema mapping, testing, import, delete, and orphan cleanup present; use a disposable Notion fixture later. |
| NT-03 | Static/mocked only | Sync/retry/wipe/log/health/webhook paths present; live non-destructive sync and rate-limit behavior remain unverified. |

## Remediations implemented

### Privacy and authorization

- Added revision-only player map, Center Screen map, and Story event tables.
- Added role-checked snapshots that explicitly redact map Storage names, hidden
  token metadata, numeric AC, source/prep links, wall labels, DM notes, combat
  detail, and unrevealed Story rows.
- Made mixed-privacy map/Story sources and travel source rows DM-only.
- Made map Storage direct reads DM-only; player map bytes flow through the
  membership- and active-map-checked image route.
- Removed browser INSERT/UPDATE access that could forge action intents, rolls,
  attack/HP results, pending state, travel parties/members, or confirmations.
- Moved those writes behind validated server actions/RPCs with conditional roll
  claims and compensating cleanup when a later write fails.
- Hardened legacy SECURITY DEFINER functions with fixed search paths and explicit
  execution grants; internal room-reveal and wall-name helpers are not callable
  by browser roles.
- Required current campaign membership, an active map, and a currently visible
  controlled token before player movement. Hidden portals cannot invoke travel.

### Movement correctness

- `set_active_map` validates the target and switches maps in one transaction.
- Player travel-setting changes require membership and the active map; DM-only
  lock, limit, vision, and combat controls cannot be supplied by players.
- Travel parties can be created only through the validated active/unlocked-map
  RPC, invitations remain self-only, and approval remains DM-only.
- A linked door opens only a crossing near both the door and movement path.
- Every accepted group follower path is checked before any group token moves,
  so a blocked follower makes the move fail as a unit.

### Cost and reliability

- Proxy auth uses `getClaims()`, preserves Supabase cookie/cache headers, and
  runs only on authenticated UI route families.
- Player drag/drop calls Supabase directly instead of invoking Vercel for every
  movement.
- Multi-row map writes coalesce to one revision event per transaction, and the
  client debounces snapshot refreshes.
- Persistent snapshot/channel failures back off exponentially with jitter up to
  30 seconds; snapshot failure does not recreate a healthy channel.
- The global queue widget is disabled on the queue route, collapses realtime
  bursts, and combines latest-row/pending-count work.
- Stable private image validators follow the immutable object path, so ordinary
  grid/token/fog changes do not re-download the same map image.
- Story signs all handouts in one Storage call with a five-minute lifetime.
- Redundant success-path route refreshes were removed where local state and
  realtime/revalidation already provide the result.

### Visual and accessibility

- App/map shells use dynamic viewport height and explicit nested scroll bounds.
- The player roll overlay is height-capped and scrollable on small screens.
- Shared controls have 44px minimum targets and reduced-motion fallbacks.
- The shared modal provides dialog semantics, labelled/described relationships,
  Escape/backdrop dismissal, focus containment, initial focus, and restoration.
- Adventure creation and clear-board dialogs use the shared modal; affected
  error/success messages have alert/status semantics.

## Cost guardrails for deployed fixture QA

Stop the isolated audit run before any cap is crossed:

| Meter | Audit-run cap |
|---|---:|
| Vercel invocations | 10,000 |
| Vercel transfer | 1 GB |
| Supabase uncached egress | 250 MB |
| Supabase cached egress | 250 MB |
| Supabase Realtime messages | 20,000 |
| Peak Realtime connections | 20 |

The estimate workload is one DM, six players, and one Center Screen for four
hours, four sessions per month. A before/after dashboard delta is still required
to prove the normal-use target; source inspection cannot prove provider billing.

Residual cost risks to measure are the protected map-image proxy on a cold
browser cache, lower-frequency Story route refreshes, serial Notion sync work,
and large client components (`PlayerMapView`, `MapEditor`, and
`PreparedMapEditor`). A hidden/revoked handout can also remain accessible through
an already-issued signed URL for at most five minutes.

## Required release sequence

The migration and code are one atomic release unit:

1. Stage the exact Vercel build without promoting it.
2. Confirm the build commit contains migration `20260713041904` and that the
   server-only service-role key is configured.
3. Enter a maintenance window so old clients cannot use the retired contracts.
4. Run `npm.cmd run db:migrate` against the explicitly confirmed target project.
5. Immediately promote the matching staged build.
6. Run the DM + Player 1 + Player 2 + Center Screen matrix, including direct
   source-table/RPC adversarial checks and reconnect tests.
7. Capture Vercel/Supabase before/after usage deltas and representative viewport
   screenshots before declaring the release verified.

Do not deploy the code without the migration or apply the migration while old
code remains live. A rollback must restore code and compatible database
contracts together; do not blindly reverse privacy policies while new clients
are active.

## Remaining blockers

- No SQL runtime/apply proof for migration `20260713041904`.
- No authenticated disposable DM, Player 1, Player 2, and Center Screen fixture.
- No post-change visual screenshots at 1440x900, 375x812, 430x932, 844x390,
  and 1920x1080; no automated accessibility scan.
- No Supabase security advisor, query-plan, slow-query, or migration-ledger
  export from the target project.
- No Vercel/Supabase dashboard usage deltas.
- Notion runtime behavior remains intentionally static/mocked in this audit.

Until those are completed, the accurate status is: **repository remediation
implemented and statically verified; deployed release verification blocked**.
