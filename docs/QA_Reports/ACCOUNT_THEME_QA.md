# Account Theme Selection QA

Date: 2026-07-13

## Release Contract

- New profiles default to Emberforge and must confirm one of five themes after authenticated email confirmation.
- Existing profiles are backfilled to Moonlit Grimoire with onboarding complete.
- One profile preference follows the account through both DM and player roles.
- Account Settings exposes Emberforge, Moonlit Grimoire, Emerald Enclave, Frostbound Archive, and Golden Parchment.
- The migration and application code are one release unit.

## Automated Gates

- [x] `npm.cmd run audit:theme`
- [x] `npm.cmd run test:unit` — 13 passed.
- [x] `npx.cmd tsc --noEmit`
- [x] `npm.cmd run lint`
- [x] `npm.cmd run build`
- [x] Production-server Playwright run of `tests/e2e/app-smoke.spec.ts` — 7 passed, including all five palettes and 375px overflow.
- [ ] `npm.cmd run check:e2e-env`
- [ ] `npm.cmd run test:e2e:auth`

The authenticated gates are blocked because `E2E_DM_EMAIL`, `E2E_DM_PASSWORD`, and `E2E_CAMPAIGN_ID` are unset.

The production Supabase project was verified on 2026-07-13: both profile columns, the Emberforge default, the five-value constraint, and the seven-account Moonlit/onboarding backfill matched the migration. Migration history was repaired for version `20260714023612`; `npm.cmd run db:migrate` then reported the remote database up to date. Database advisors completed with no error-level findings; existing project-wide warning-level findings remain outside this theme change.

Core text, muted text, accent foreground, and status colors were contrast-checked against their primary surfaces. Small faint text was adjusted where necessary; Golden Parchment uses darkened success, warning, and faint colors for light-surface readability.

## Authenticated Runtime Scenarios

- [ ] Confirmation-required registration remains on “Check your email,” then the newest email link creates a session and opens the required chooser.
- [ ] Invalid, missing, and expired confirmation links show a readable login error and registration retry path.
- [ ] A new user sees Emberforge preselected, cannot dismiss with Escape/backdrop, can keyboard-select all five choices, and cannot enter the app until saving succeeds.
- [ ] An existing account remains Moonlit Grimoire and does not receive the chooser.
- [ ] Theme changes in Account Settings persist across reload, logout/login, a second device, and DM/player campaign roles.
- [ ] Save failure leaves the chooser or settings usable and does not claim success.
- [ ] Golden Parchment uses light browser controls and readable focus, status, DM-only, and player-safe colors.
- [ ] Desktop and 320/375px mobile layouts have reachable Settings navigation, 44px targets, safe-area spacing, and no horizontal overflow.

## Feature-Parity Boundary

Run the existing `OPTION3_THEME_FEATURE_BASELINE.md` DM/player scenarios. Theme selection must not alter campaign authorization, player-safe projections, realtime subscriptions, map movement, action resolution, character editing, Codex visibility, or campaign settings access.
