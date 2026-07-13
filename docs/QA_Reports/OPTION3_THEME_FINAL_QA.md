# Option 3: Moonlit Grimoire Final QA Report

**Baseline commit:** `fec33bfbc39ed933b578c40c8e7817e8a159907f`  
**Themed commit:** Working tree; not committed when this report was created  
**Report date:** 2026-07-12  
**Overall status:** **THEME IMPLEMENTED; STATIC/PUBLIC RUNTIME GATES PASS; AUTHENTICATED PARITY BLOCKED**

This report is deliberately evidence-based. A check is `PASS` only when it was run against the themed build. Source inspection is not substituted for authenticated browser, database, privacy, or realtime proof.

## Environment and evidence

| Item | Status | Evidence / blocker |
|---|---|---|
| Baseline inventory | PASS | `OPTION3_THEME_FEATURE_BASELINE.md` inventories routes, roles, actions, privacy boundaries, and post-theme checks from baseline commit source |
| Linked Supabase migration history | NOT RUN | Requires linked project credentials and comparison with repository migrations |
| Disposable DM + Player 1 + Player 2 campaign | BLOCKED | Authenticated fixture credentials/data were not available during implementation |
| Pre-change visual references | NOT CAPTURED | The working tree was already being restyled when QA artifacts were added |
| Post-change visual references | PASS (public) | Production `/login` inspected at `1280x720` and `375x812`; Moonlit palette/typography rendered and both viewports had zero horizontal overflow |

## Automated gates

| Gate | Status | Result |
|---|---|---|
| `npm.cmd run audit:theme` | PASS | Exit `0`: `Theme audit passed: no non-allowlisted zinc/amber utilities remain in app/ or components/.` |
| `npx.cmd tsc --noEmit` | PASS | Exit `0`; no diagnostics |
| `npm.cmd run lint` | PASS | Exit `0`; ESLint reported no findings |
| `npm.cmd run build` | PASS | Exit `0`; Next.js 16.2.7 production build compiled, typechecked, generated 13 static pages, and listed all expected dynamic routes |
| `npx.cmd playwright test tests/e2e/app-smoke.spec.ts --project=chromium --reporter=line` | PASS | `5 passed (4.7s)` against the explicitly started production server: redirect, login controls, registration controls, semantic tokens, and 375px overflow |
| In-app production-browser inspection | PASS (public) | Computed canvas `#100d16`, accent `#b8a7ff`, player-safe `#67e8c2`, DM-only `#f0719b`; Cormorant display typography loaded; desktop and mobile overflow `0` |
| `npm.cmd run check:e2e-env` | EXPECTED FAIL / BLOCKED | Missing `E2E_DM_EMAIL`, `E2E_DM_PASSWORD`, and `E2E_CAMPAIGN_ID`; authenticated claims are intentionally withheld |
| `npm.cmd run test:e2e:auth` | BLOCKED | Requires DM fixture; current suite also requires queued actions for non-skipped card coverage |
| Full DM/player/realtime suite | BLOCKED | Player 1/Player 2 fixture suite does not yet exist |

## Feature matrix reconciliation

Status values: `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`. A whole group may pass only when every baseline row in that group passes.

| Baseline IDs | Surface | Static parity | Authenticated runtime | Responsive/visual | Notes |
|---|---|---|---|---|---|
| SH-01–SH-04 | Auth and global shell | PASS | BLOCKED | PASS (public auth) | Five public smoke tests and two inspected viewports pass; authenticated realtime shell needs fixtures |
| CM-01–CM-05 | Campaign management | PASS (code/build) | BLOCKED | BLOCKED | Export must retain DM-only `403` and current v1 payload scope |
| CH-01–CH-03 | Characters | PASS (code/build) | BLOCKED | BLOCKED | Ownership and DM-note boundaries require two players |
| EN-01–EN-02 | Encounters | PASS (code/build) | BLOCKED | BLOCKED | All route/component code compiles; runtime needs fixture data |
| ST-01–ST-02 | Story / Journal | PASS (code/build) | BLOCKED | BLOCKED | Must prove hidden records are absent from player reads |
| AC-01–AC-05 | Actions, rolls, messages | PASS (code/build) | BLOCKED | BLOCKED | Existing authenticated suite requires DM credentials and seeded requests |
| AM-01–AM-05 | Adventure Maker | PASS (code/build) | BLOCKED | BLOCKED | Prepared map editor needs authenticated long-content/mobile coverage |
| LM-01–LM-08 | Live Map / Tabletop / Center Screen | PASS (code/build) | BLOCKED | BLOCKED | Highest-risk privacy, overlay, and realtime group |
| CX-01–CX-03 | Adventure Codex | PASS (code/build) | BLOCKED | BLOCKED | Source/publication separation must be tested from player client |
| NT-01–NT-03 | Notion bridge | PASS (code/build) | BLOCKED | BLOCKED | Requires server-only credentials/test integration; no secrets may reach browser |

## Mandatory manual scenarios

Record links to screenshots/traces and a `PASS`/`FAIL` for each scenario after the themed build is available.

### DM

- [ ] Desktop and tablet navigation, collapsed sidebar, campaign dashboard, settings, member removal, invite regeneration, and export.
- [ ] Character party dashboard, encounter turn cycle, every Story record type, upload, and visibility controls.
- [ ] Action cards in pending, roll-required, review, resolved, nudged, and state-update states; every confirmation/dialog.
- [ ] Adventure/chapter/prep database; prepared map tools; token builder/detail; lookup; hub; deployment modes.
- [ ] Live map upload/activation/session; grid; token menus; fog/reveal; rooms/doors; walls; party/travel; portals/transport; Codex links.
- [ ] Codex create/edit/search/link/reveal plus Notion connection/mapping/schema/sync/health states.

### Player 1 and Player 2

- [ ] Role-aware navigation, own/other character permissions, Party Journal, and Revealed Info.
- [ ] Player Tabletop portrait and landscape: pan/zoom, hints, owned-token movement, collision/range/lock, action tray, character drawer, travel and portal confirmations.
- [ ] Generic and attack roll popup including modifier warning, manual result, critical result, and revealed outcome.
- [ ] Party reveal reaches both players; targeted reveal/whisper/roll reaches only Player 1.
- [ ] No hidden source rows or private fields appear in DOM, network responses, realtime events, or Supabase reads.

### Center Screen and realtime

- [ ] `1920×1080` cast/map layout matches player-safe visibility and contains no hidden token/room/Codex data.
- [ ] Token movement, map settings, visibility, discoveries, fog, rooms, walls, travel, and reveal overrides update without refresh.
- [ ] Network interruption produces a single degraded-state notice and recovers without duplicate popups or stale state.

## Accessibility and visual acceptance

- [ ] WCAG 2.2 AA contrast: 4.5:1 normal text; 3:1 large text and meaningful controls.
- [ ] Keyboard focus is visible; tab order is logical; dialogs close with Escape and restore focus.
- [ ] Statuses use labels/icons as well as color; DM-only and player-safe meaning is explicit.
- [ ] Reduced-motion disables roll, nudge, and decorative nonessential animation.
- [ ] Usable at 200% zoom with no unintended page-level horizontal scrolling.
- [ ] Mobile controls are reachable, long panels scroll internally, and close/back actions are not clipped.
- [ ] Touch targets are 44×44 CSS pixels where practical.
- [ ] Light and dark map art retain readable grid, fog, tokens, targets, HP, walls, rooms, and floating controls.

## Release decision

The theme implementation passes its semantic audit, type, lint, production-build, public browser-smoke, and public responsive-render gates. It must **not** be called authenticated feature-parity complete until:

1. Every feature ID in the baseline is reconciled individually with no `FAIL`, `BLOCKED`, or `NOT RUN` rows.
2. Authenticated suites contain no environment skips.
3. DM/player/Center Screen privacy checks pass from actual player sessions.
4. Required desktop/mobile/landscape/Center Screen visual evidence is approved.
5. No P0/P1 functional, privacy, responsive, or accessibility issue remains.

## Open coverage gaps

- No automated two-player fixture/setup or storage-state generation exists yet.
- The current authenticated Playwright file is DM action-queue focused and intentionally skips data-dependent cases when the configured campaign has no requests.
- `@axe-core/playwright` is not installed; no dependency was added during this pass. Accessibility acceptance therefore remains manual unless the project explicitly approves and pins that package later.
- Cross-browser Firefox/WebKit coverage requires installed Playwright browsers and has not been demonstrated in this environment.
- The first Playwright attempt hung in the configured dev-server lifecycle and was terminated cleanly. The required follow-up against an explicitly started production server succeeded with all five public tests passing.
