# Adventure Maker — Phase 4 (Prepared Maps / Encounter Scenes)

## Status

Implemented (2026-06-09). Chapters now hold prepared maps with a full prep
editor: background image, grid, draggable tokens, DM notes, links, status,
player-style preview, and a working "Send to Live Map" deploy. Follows
`docs/ADVENTURE_MAKER_PHASE3.md`.

## Routes

- `/campaigns/[id]/adventures/[adventureId]/chapters/[chapterId]` — chapter
  workspace now lists prepared-map cards (thumbnail, title, status badge,
  description, token count, DM-note count, last-edited) with Create Map and an
  intentional empty state.
- `.../chapters/[chapterId]/maps/[preparedMapId]` — NEW prep editor page with
  the 4-level breadcrumb (Adventure Maker / adventure / chapter / map).

Both DM-only.

## Data model

Migration `supabase/migrations/021_prepared_maps.sql` (run AFTER 020):

- `prepared_maps`: `id`, `adventure_id` (FK cascade), `chapter_id` (FK
  cascade), `campaign_id` (denormalized for RLS), `title`, `description`,
  `storage_path` (nullable — image optional; lives in the existing private
  `maps` bucket under `{campaignId}/prepared-*`), `width`/`height`,
  `grid_enabled`, `grid_size`, `tokens` JSONB, `notes` JSONB, `links` JSONB,
  `status` (draft/ready/active/archived), timestamps + trigger.
- Design call: tokens/notes/links are JSONB on the row, NOT separate tables —
  prep data is DM-only and single-editor, so it doesn't need per-token
  realtime sync or RLS like the live `tokens` table. They become live rows on
  deploy.
- RLS: DM-only `FOR ALL`; realtime publication for DM multi-tab freshness.
- The spec's `mapImageUrl` is implemented as `storage_path` + short-lived
  signed URLs, consistent with the live map privacy model.

Types: `PreparedMap`, `PreparedMapToken`, `PreparedMapNote`,
`PreparedMapLink` in `lib/types/adventure.ts` (declared with `type` so JSONB
collections assign to the typed client); `prepared_maps` added to `Database`.

## Server actions (`lib/actions/prepared-maps.ts`)

- `createPreparedMap` — title/description; returns id.
- `savePreparedMap` — ONE save for everything the editor edits (details,
  status, grid, tokens, notes, links); server-side sanitization (caps: 200
  tokens, 100 notes, 50 links; color/size/coordinate clamping).
- `setPreparedMapImage` / `removePreparedMapImage` — image lifecycle; replaced
  or removed files are deleted from storage best-effort.
- `deletePreparedMap` — removes row + image, redirects to the chapter.
- `sendPreparedMapToLiveMap` — deploys: copies the image within the `maps`
  bucket (so deleting prep never breaks live), creates a live `maps` row
  (inactive, prepared grid settings applied) and live `tokens` rows from the
  prepared layout. The prepared original is untouched and re-deployable.

## Editor (`components/adventures/PreparedMapEditor.tsx`)

- Reuses `MapCanvas` (pan/zoom/grid/drag) in DM mode; all prepared tokens are
  draggable; selection highlights the token in the sidebar.
- Sidebar sections: Details (title/description/status — "Ready" is the
  ready-for-Live-Map marker), Background & Grid (Add/Replace/Remove Image,
  grid toggle + px size), Tokens (Add Token, per-token name/type/size/color/
  player-visibility/remove; type change re-derives the standard color), DM
  Notes (Add DM Note), Links (Add Link, label+URL, open-link affordance only
  for http(s) URLs), Delete Map.
- Header actions: Preview (player-style full-screen: hidden tokens excluded,
  no fog), Send to Live Map (requires an image; requires saving first),
  Save (single explicit save with dirty indicator and "Saved" flash).
- No image yet → large upload dropzone in place of the canvas; token placement
  is disabled until an image exists (canvas needs image dimensions).
- Mobile: single column (canvas above sidebar); editor is desktop/tablet-first
  per spec.

## Editor limitations (known, deliberate)

- Tokens keep pixel coordinates when the image is replaced/removed — a
  different-sized image can leave tokens off-canvas (drag or re-add them).
- No image cropping/scaling; grid offset/color/brightness knobs from the live
  DM editor are not in prep yet (grid on/off + size only, per spec).
- DM notes/links do NOT transfer on deploy — the live system has no map-level
  note model (only per-token `token_dm_notes`); notes stay visible in the prep
  editor as the DM's companion reference.
- Deploy always creates a NEW inactive live map (no replace/merge of an
  existing live map); activating it still happens from Live Map.
- Link URLs are stored as entered (length-capped); only http(s) links render
  an open affordance.

## QA

- `npx tsc --noEmit`, `npx eslint`, `npm run build` — all pass; build emits
  the new editor route.
- Runtime checklist (create map in chapter, edit details, upload image, grid,
  tokens/notes/links, save + reopen, correct chapter/adventure linkage, empty
  states, deploy to Live Map) requires migration 021 applied to Supabase —
  pending manual run alongside 019/020.
