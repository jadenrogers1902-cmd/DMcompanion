# Phase 11 - Full QA, Mobile Polish, Cleanup & Documentation

**Date:** 2026-06-10

## Overall Summary

Phase 11 is a stabilization pass over the full Adventure-Maker-prep → Live-Map-play
workflow built across Phases 6–10. All objective gates pass: `tsc --noEmit`,
`eslint`, and `next build` are clean, the dev server compiles every touched route, and
unauthenticated route/API gates behave correctly. The codebase is **code-complete and
statically verified**.

The single outstanding constraint is environmental, not code: **migrations 015–023 are
not confirmed-applied in Supabase, and no authenticated DM+player session was available**,
so the interactive (runtime) half of the checklist remains pending. Everything that can be
verified without a live database + two accounts has been verified.

## Completion Status By Phase

| Phase | Area | Code | Static gates | Runtime QA |
|---|---|---|---|---|
| 6 | Notion-style prep database | Complete | Pass | Pending (needs 022 + DM) |
| 7 | Phase 6 verify/harden (dup link editor fix) | Complete | Pass | Pending |
| 8 | Token public SRD resource lookup | Complete | Pass | Search path testable once logged in |
| 9 | Send Prepared Map → Live Map (3 modes) | Complete | Pass | Pending (needs 023 + DM) |
| 10 | Action/roll/DM-card/nudge remaster | Complete | Pass | Pending (needs live DM+player) |
| 11 | Full QA / mobile polish / cleanup / docs | Complete | Pass | This report |

## Bugs Found

1. **Repo did not compile at the start of Phase 8** — the `TokenResourceRef` type and a
   required `PreparedMapToken.resource` field had been added in a prior pass without
   updating the token-construction sites. (Found/fixed during Phase 8.)
2. **Duplicate token-link editor** in the prepared token drawer. (Found/fixed in Phase 7.)
3. **`Date.now()` purity violation** in the Actions server component while deriving
   nudges. (Found/fixed in Phase 10.)
4. **`ACTIVE_INTENT_STATUSES` typed as `string[]`** rejected by the typed Supabase
   `.in()`. (Found/fixed in Phase 10.)
5. **Untracked dev/test artifacts** (`dev.log`, `dev.err.log`, `playwright-report/`,
   `test-results/`) not covered by `.gitignore`. (Found/fixed in Phase 11.)

## Bugs Fixed

All five above are fixed. `tsc`, `lint`, and `build` are clean as of this report.

## Bugs Remaining

None known from static analysis. Runtime-only defects cannot be ruled out until the
migration backlog is applied and a live session is exercised (see Manual Testing
Checklist).

## UX Issues Found

- **SRD lookup search row cramped on narrow screens** (category select + input + button
  on one line). Fixed in Phase 11 — the row now stacks on mobile (`flex-col sm:flex-row`).
- Nudge highlight clears client-side only, so a hard reload re-shows an unhandled nudge.
  This is intentional (it's still waiting) and documented, not a defect.

## UX Improvements Made

- SRD lookup search controls stack cleanly on mobile.
- DM action cards now stack newest-at-bottom and surface a synced "Action Phase" strip
  (Request → Roll → Review → Resolved + waiting-on indicator).
- Pulsing "!" token alert badge gives the DM at-a-glance awareness of active requests.
- Red nudge highlight + "Nudged" badge/counter draws the DM to the right card.
- `.gitignore` now keeps dev/test artifacts out of the working tree.

## Files Changed (Phase 11)

- `components/adventures/TokenResourceLookup.tsx` — mobile-stacking search row.
- `.gitignore` — ignore `playwright-report/`, `test-results/`, `dev*.log`, `*.smoke.log`.
- `docs/PHASE11_FINAL_QA_REPORT.md` *(new)*, `docs/QA_CHECKLIST.md`,
  `PHASE_COMPLETION_REPORT.md` — this QA pass.

(Phases 6–10 file lists are in their own phase docs and `PHASE_COMPLETION_REPORT.md`.)

## Manual Testing Checklist (run once migrations 015–023 are applied + a DM & player are signed in)

**Adventure Maker**
- [ ] Navigate Adventures → Chapter → Prepared Map without dead links.
- [ ] Token detail drawer: edit name/type/visibility/status/tags/size/color.
- [ ] Notes/links/tags save and reload at Adventure, Chapter, Map, and Token levels.
- [ ] SRD lookup: search each category, attach a result, detach, confirm DM notes untouched.

**Prep → Live Map (Phase 9)**
- [ ] "Add as next scene" creates an inactive map; players keep the current map.
- [ ] "Duplicate" makes an independent "(Copy)"; deploy count increments.
- [ ] "Replace current Live Map" two-step confirm; new map active, old map deactivated (not deleted).
- [ ] Hidden/revealed/dm_only tokens deploy unseen; only `visible` are player-visible.
- [ ] "Prep source" link appears for the DM and routes back to the prep editor.
- [ ] Editing the deployed live map leaves the prepared map unchanged.

**Live Map session (Phase 10)**
- [ ] Player submits a request → "!" badge appears on the target token (DM view).
- [ ] Newest DM action card is at the bottom of the stack.
- [ ] Player "Nudge DM" → matching card turns red; opening/acting clears it.
- [ ] Expanded DM card phase strip tracks the player's phase and shows who it's waiting on.
- [ ] Roll flow: auto roll animation + manual entry; reroll issues a fresh request.
- [ ] Resolve & Reveal completes; player and DM see the same outcome styling.

**Privacy (two accounts)**
- [ ] Player never sees DM-only token notes, suggested updates, hidden tokens, or prep data.
- [ ] Nudge metadata and the "!" badge are DM-only.

## TypeScript / Lint / Build Results

| Check | Result |
|---|---|
| `npx.cmd tsc --noEmit` | Pass |
| `npm.cmd run lint` | Pass |
| `npm.cmd run build` | Pass |
| Dev server compile + `/login` | OK / 200 |
| Unauth `/api/srd` | 401 |
| Unauth `/campaigns/*/actions`, `/live-map/*`, `/adventures` | 307 → `/login` |

## Mobile Testing Notes

- Player roll popup, mobile nav, and PlayerMapView retain their existing responsive
  layouts (unchanged this cycle).
- Token detail drawer renders as a bottom sheet on mobile (`max-h-[75dvh]`, scrollable).
- SRD lookup row now stacks on mobile (Phase 11 fix).
- Send-to-Live-Map dialog is a centered modal (`w-full max-w-md`, `max-h-[70vh]` scroll) —
  fits narrow viewports.
- Adventure Maker is a DM-focused desktop tool by design; full small-screen visual QA at
  375/430/768/1024/1440 still requires a browser pass.

## Security / Privacy Notes For DM-Only Content

- **Prep tables** (`adventures`, `adventure_chapters`, `prepared_maps`) are DM-only under
  RLS; players cannot read prep notes, links, tags, or SRD references.
- **`maps.source_prepared_map_id`** (Phase 9) is an opaque reference id only — no DM
  content lives on the realtime-published `maps` row; the prep stays behind RLS.
- **Deploy** routes per-token DM notes to the unpublished, DM-only `token_dm_notes` table;
  map-level DM notes/links are never copied onto the live map (reached via the prep link).
- **Phase 10**: the "!" badge is rendered only in the DM editor (PlayerMapView never
  receives `alertTokenIds`); nudge → card matching uses `delivery_log.intentId` and is
  derived DM-side only; nudge rows are already DM-scoped by RLS.
- **SRD lookup** returns only public CC-BY-4.0 SRD data via an auth-gated route; it never
  reads or writes DM notes.

## Known Limitations

- Runtime QA blocked until migrations 015–023 are applied in Supabase.
- No Cast View is implemented (only `docs/CAST_VIEW_REQUIREMENTS.md` + a reserved
  `tokens.visible_on_cast` flag) — nothing to QA there yet.
- Nudge "handled" state is client-side (reload re-shows an unhandled nudge by design).
- SRD `source_url` points at the Open5e API detail endpoint (stable across categories).
- Reroll reuses the standard Ask-Roll builder rather than auto-copying prior roll settings.

## Recommended Next Improvements

1. **Apply migrations 015–023** in Supabase and run the manual checklist above with a DM +
   player account — this is the highest-value next step and unblocks all pending runtime QA.
2. Implement the **Cast View** (fullscreen, player-safe-only) per its requirements doc.
3. Optional: a campaign/profile setting to globally disable celebratory roll animations
   (the Phase 5 accessibility carry-forward).
4. Optional: persist nudge "handled" state (needs a `party_messages` UPDATE policy) so the
   highlight survives reloads.

## Prompt Classification Table (updated)

| Prompt / Work Area | Classification | Status | Run Next? |
|---|---|---|---|
| DM map layout / right-side scroll fix | Maintenance fix | Implemented | No — verify only |
| DM map viewport QA | Verification | Pending (needs browser) | Yes (manual) |
| Phase 6 Notion-style prep database | Feature | Implemented | No |
| Phase 6 runtime CRUD/migration QA | Verification/hardening | Pending | Yes (after migration) |
| Token public resource lookup | Feature | Implemented (Phase 8) | No |
| Send Prepared Map → Live Map | Feature | Implemented (Phase 9) | No |
| Action/roll/DM-card remaster | Major implementation | Implemented (Phase 10) | No |
| Nudge DM red card highlight | Sub-feature | Implemented (Phase 10) | No |
| Dominoes-style tracker | Deprecated wording | Replaced (phase strip) | Do not use |
| Player-screen-matched DM phase view | Updated requirement | Implemented (Phase 10) | No |
| Full QA / mobile / docs cleanup | Final QA | Implemented (Phase 11) | No — runtime pass pending |
