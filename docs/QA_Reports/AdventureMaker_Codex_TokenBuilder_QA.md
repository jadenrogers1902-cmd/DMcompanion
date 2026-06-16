# Adventure Maker + Codex Token Builder QA

Date: 2026-06-13

## Executive Summary

Status: Static verification passed. Browser smoke verification reached the app
and confirmed the unauthenticated Adventure Maker editor route redirects to
login. Full authenticated DM/player interaction QA remains pending.

Adventure Maker now uses Adventure Codex cache data as the source for linked
map tokens. Notion is not queried by the token builder and does not directly
control live map or combat state.

## What Changed

- Added a left-side **Map Builder Tokens** panel to the prepared-map editor.
- Kept map details, image/grid, DM notes, links, and delete controls in the
  right-side settings panel.
- Replaced the old standalone **Tokens** and **Linked Codex Docs** cards.
- Added linked dynamic-token creation from cached `campaign_docs`.
- Added static object quick-add tokens for common map objects.
- Added token metadata for Codex linkage, source label, dynamic/static behavior,
  movement lock, combat eligibility, interaction eligibility, and object state.
- Added per-token Codex attach/detach controls so static objects can optionally
  link to cached Codex records.
- Updated prepared-map deployment so linked prepared tokens create live
  `campaign_doc_links` rows for the deployed live tokens.

## Architecture Verified

Intended flow:

`Notion tables -> Adventure Codex cache -> Adventure Maker Token Builder -> prepared map tokens/objects -> live map engine`

The implementation reads `campaign_docs` already fetched by the prepared-map
page and passes those records to the client-side builder. The builder does not
call Notion APIs. Deployment creates live tokens and app-owned Codex link rows.

## Layout QA

| Test | Result | Notes |
|---|---:|---|
| Left workspace contains Token Builder panel | Static PASS | `PreparedMapEditor` now renders `TokenBuilderPanel` before the canvas in the desktop grid. |
| Right side keeps map/cosmetic/details options | Static PASS | Details, image/grid, DM notes, links, and delete remain in the right prep sidebar. |
| Old Tokens card removed/replaced | Static PASS | The old standalone Tokens section was removed; token list/recent controls moved into Token Builder. |
| Old Linked Codex Docs card removed/replaced | Static PASS | The old prepared-map-level linked-doc card was removed; linked Codex context now appears in selected token detail. |
| DM notes still exist | Static PASS | DM Notes section remains in the right panel. |
| Links still exist | Static PASS | Links section remains in the right panel. |
| Desktop layout works | Static build PASS | Full authenticated visual QA pending DM session. |
| Mobile/tablet layout works | Static PASS | Grid collapses naturally; full visual QA pending authenticated browser access. |

## Dynamic Token QA

| Test | Result | Notes |
|---|---:|---|
| Add Linked Token card appears | Static PASS | Implemented in `TokenBuilderPanel`. |
| Codex/Notion table pills appear | Static PASS | Pills derive from available cached `campaign_docs.doc_type` values. |
| Clicking a pill opens inline mini table | Static PASS | Active type filter controls the mini table inside the card. |
| Synced Codex/Notion records appear | Static PASS | Uses cached `campaign_docs`, including `source = notion`; no direct Notion query. |
| Add Token creates linked entity token | Static PASS | Prepared token stores `linked_campaign_doc_id` and clean source label. |
| Created token links back to Codex record | Static PASS | Token detail displays Codex entry and links to Adventure Codex. |
| DM can open linked Codex doc | Static PASS | Token detail provides an Open Codex doc action. |
| DM can reveal player-safe info | Static PASS | Token detail uses existing Codex reveal controls. |
| Players do not see DM-only linked docs | Static PASS | Player access still relies on existing Codex publication/reveal model. |

## Static Token QA

| Test | Result | Notes |
|---|---:|---|
| Static Tokens card appears | Static PASS | Implemented in left Token Builder. |
| Door can be added | Static PASS | Door quick-add template. |
| Chest can be added | Static PASS | Chest quick-add template. |
| Lever/button can be added | Static PASS | Lever and Button templates. |
| Trap/hazard can be added | Static PASS | Trap and Hazard templates. |
| Custom static token can be added | Static PASS | Custom template. |
| DM can move static tokens in prep | Static PASS | MapCanvas still allows DM drag in prep. |
| Players cannot move static tokens | Static PASS | Static tokens deploy with `movement_locked = true`; players cannot access Adventure Maker. |
| Visible static tokens can support interactions | Static PASS | Static tokens carry `interactable`, `object_state`, and `requires_approval`. |
| Static tokens can optionally link to Codex | Static PASS | Token detail drawer includes attach/detach controls for cached Codex entries. |

## Realtime / Live Map QA

| Test | Result | Notes |
|---|---:|---|
| Added tokens appear on prepared map | Static PASS | Click-to-add updates local token state and selects the token. |
| Saved tokens persist after refresh | Static PASS | Existing `savePreparedMap` persists normalized JSONB tokens. Runtime pending. |
| Tokens appear in live map when appropriate | Static PASS | Existing deploy path inserts live `tokens`; linked rows are added after insert. Runtime pending. |
| Hidden tokens do not appear to players | Static PASS | Deploy uses `revealStateIsPlayerVisible`; only `visible` becomes player-visible. |
| Player-safe revealed content updates without refresh | Not retested | Covered by existing Codex publication/realtime design; authenticated runtime pending. |
| No duplicate realtime subscriptions | Not affected | No new subscriptions added. |

## Security / Privacy QA

| Test | Result | Notes |
|---|---:|---|
| Players cannot access Adventure Maker | Browser PASS for unauthenticated; static PASS for role guard | Editor route redirects unauthenticated users to `/login`; page has DM role redirect. |
| DM-only Codex content does not leak | Static PASS | Builder receives DM data only on DM-only route; player UI still uses safe projections. |
| Raw Notion IDs do not appear | Static PASS | UI renders title/type/source labels only. |
| Raw Supabase/API errors do not appear | Static PASS | No new raw error rendering added. |
| Static objects cannot be moved by players | Static PASS | Static tokens deploy movement-locked and unlinked to player ownership. |

## Build Verification

- `npx.cmd tsc --noEmit` PASS.
- `npm.cmd run lint` PASS.
- `npm.cmd run build` PASS.
- `npm.cmd run test:e2e` PASS: 2 smoke tests passed, 3 authenticated DM tests
  skipped because `E2E_DM_EMAIL`, `E2E_DM_PASSWORD`, and `E2E_CAMPAIGN_ID` are
  unset.
- Browser smoke:
  - `http://localhost:3000/login` loads with email/password fields.
  - Unauthenticated navigation to the Adventure Maker prepared-map editor route
    redirects to `http://localhost:3000/login`.

## Files Changed

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

## Database Changes

None.

## Known Issues

- Drag-and-drop from Codex entry to map is not implemented; click-to-add is the
  supported workflow.
- Full authenticated DM/player runtime QA is pending credentials/session access.
- Existing Live Map deployment behavior still requires the DM to save prepared
  map edits before sending to Live Map.

## Rollback Notes

Revert the files listed above. No migration rollback is needed. Reverting this
UI does not delete Notion data, Adventure Codex docs, prepared maps, or live map
tokens.

## Next Recommended Phase

Run authenticated DM/player browser QA with a real campaign, then decide whether
to add drag-to-place placement and richer token stat mapping.
