# Player Visual Navigation QA

Date: 2026-07-14
Scope: Player presentation, navigation, scanability, responsive controls, and feature preservation
Status: Static and public-browser verification complete; authenticated player runtime verification pending

## Acceptance Summary

- Player phone navigation exposes Home, Characters, Adventure, and More.
- More contains Encounters, Journal, Revealed Info, Account Settings, All Campaigns, and Join Campaign.
- Campaign Home retains Adventure, characters, encounters, Journal, Revealed Info, and Party while presenting the primary destinations visually.
- Character sheets/templates, encounters, Journal, Revealed Info, Adventure controls, actions, rolls, movement, travel, and player settings remain reachable.
- No player or DM feature, route, form, action, query, realtime subscription, or stored field was removed.
- No migration, schema, RLS, Storage policy, RPC signature, or server-action contract changed.

## Visual Assets

All assets were visually inspected after WebP optimization. They contain no text, logos, or watermarks and use a cohesive parchment/ink fantasy treatment.

| Asset | Dimensions | Size |
|---|---:|---:|
| `adventure.webp` | 768x768 | 125,680 bytes |
| `characters.webp` | 768x768 | 127,402 bytes |
| `encounters.webp` | 768x768 | 108,138 bytes |
| `journal.webp` | 768x768 | 101,600 bytes |
| `revealed-info.webp` | 768x768 | 112,942 bytes |

## Automated Verification

| Check | Result | Evidence |
|---|---|---|
| TypeScript | Pass | `npx.cmd tsc --noEmit` exited 0 |
| ESLint | Pass | `npm.cmd run lint` exited 0 |
| Theme guard | Pass | `npm.cmd run audit:theme` found no non-allowlisted legacy utilities |
| Unit contracts | Pass | `npm.cmd run test:unit`: 18 passed, 0 failed |
| Production build | Pass | Next.js 16.2.7 compiled, type-checked, and generated all routes |
| Diff integrity | Pass | `git diff --check` exited 0; only Git line-ending notices were emitted |
| Public Playwright | Pass | 7 passed against the final `next start` production build |
| Authenticated Playwright | Blocked | 4 DM tests and 1 player test skipped because fixture environment variables are unset |

The default Playwright dev-server attempt reached the test run but timed out while the restricted environment repeatedly retried Google Fonts. Running the same suite against the already-built production server completed in 2.9 seconds: 7 passed and 5 credential-gated tests skipped.

## Added Regression Coverage

- Imports the real navigation descriptor helpers and asserts the exact player phone, player desktop, DM desktop, live-state, and unresolved-role destination sets.
- Verifies all five referenced Campaign Home artwork files exist.
- Confirms the visible Hand, Move, Target, and Actions controls match the map legend.
- Retains the direct `move_player_token` contract check.
- Tests local/Supabase media acceptance and rejects external, lookalike-host, protocol-relative, and slash/backslash-normalized remote URLs.
- Adds an optional 390x844 authenticated player flow covering primary navigation, the complete More sheet, 44px close target, Campaign Home visual links, horizontal overflow, Journal routing, and `aria-current`.

## Manual and Review Evidence

- All five generated images were inspected at original 768x768 resolution.
- A separate combined-diff review checked role/path focus cleanup, route/asset validity, Story/Codex disclosure and media boundaries, map dialogs and token images, character/encounter semantics, metadata, and test validity. No material findings remained after fixes.
- Static inspection confirmed that DM navigation and campaign controls remain present and that player views still consume existing player-safe data.

## Blocked Coverage

The following claims are intentionally not made because `E2E_PLAYER_EMAIL`, `E2E_PLAYER_PASSWORD`, and `E2E_PLAYER_CAMPAIGN_ID` are unset:

- Authenticated screenshots at 375px, 390px, 430px, and 768px.
- Player More-sheet interaction in a real campaign membership.
- Populated Journal, Revealed Info, template, character, encounter, and live-map visual states.
- Phone movement, travel, guided action/roll, two-player realtime, reconnect, and Center Screen behavior.
- Screen-reader and supported browser/assistive-technology pairing verification.

Use `npm.cmd run test:e2e:player` after configuring a disposable player fixture. The suite skips cleanly when the fixture is absent.

## Rollback Boundary

This is a presentation-layer change. Revert the player navigation/home, Story/Codex, character/encounter, map/media, route-metadata, asset, test, and documentation files from this pass. No database or external-service rollback is required.
