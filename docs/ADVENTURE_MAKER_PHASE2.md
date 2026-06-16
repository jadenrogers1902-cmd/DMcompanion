# Adventure Maker — Phase 2 (Shell)

## Status

Implemented (2026-06-09). Adventure Maker landing page, adventure CRUD, and the
adventure detail (chapter list) shell exist. Chapters themselves arrive in the
next phase. Follows `docs/LIVE_MAP_ADVENTURE_MAKER_PHASE1.md`.

## Routes

- `/campaigns/[id]/adventures` — Adventure Maker landing (DM only; players are
  redirected to the campaign dashboard). Card grid of adventures ordered by
  last edit; empty state with Create Adventure.
- `/campaigns/[id]/adventures/[adventureId]` — adventure detail: title /
  status badge / description header with Edit + Delete, and the Chapters
  section (empty-state shell until the chapters phase).

## Data model

Migration `supabase/migrations/019_adventures.sql` (run AFTER 018):

- `adventures` table: `id`, `campaign_id` (FK, cascade), `title`,
  `description`, `status` (`draft` | `ready` | `active` | `archived`,
  default `draft`), `created_at`, `updated_at` (kept current by the shared
  `update_updated_at()` trigger).
- RLS: single DM-only `FOR ALL` policy (`is_campaign_dm`) — prep content is
  hidden DM data; players can neither read nor write any row.
- Added to the `supabase_realtime` publication with `REPLICA IDENTITY FULL`
  (safe: RLS filters all rows away from players) so the DM's other tabs stay
  fresh per the no-manual-refresh requirement.

Types:

- `lib/types/adventure.ts` — `Adventure` is now the real row type plus
  `AdventureStatus`; `Chapter`/`PreparedMap` remain forward declarations.
- `lib/types/database.ts` — `adventures` table added to the `Database` type.

## Server actions (`lib/actions/adventures.ts`)

- `createAdventure(campaignId, { title, description })` → `{ adventureId }`
- `updateAdventure(campaignId, adventureId, { title?, description?, status? })`
  — status values validated server-side against the four allowed states
- `deleteAdventure(campaignId, adventureId)` — redirects back to the landing
  page on success

All rely on the DM-only RLS policy for authorization (DB is the enforcement
layer), and revalidate the landing + detail paths.

## Components (`components/adventures/`)

- `CreateAdventureButton.tsx` — modal create form (bottom sheet on mobile,
  centered dialog on desktop); routes to the new adventure on success.
- `AdventureSettingsPanel.tsx` — detail-page header: view mode (title, status
  badge, description, Edit/Delete) and edit mode (title, description, status
  select incl. Archived, save/cancel). Delete uses the app's `confirm()`
  pattern.
- `adventure-status.ts` — status → label (`active` shows as "In Progress")
  and badge-variant mapping shared by cards and the detail panel.

## Navigation

- `components/nav/Sidebar.tsx` — "Adventure Maker" item (DM only) under the
  campaign section, between Live Map and Players.
- `components/nav/DMUtilityPanel.tsx` — "Adventure Maker" quick link.
- `app/(app)/campaigns/[id]/page.tsx` — "Adventure Maker" card in the DM
  Session Control grid.
- Mobile bottom nav (`MobileNav.tsx`) deliberately unchanged — it is already
  at five condensed items and prep is a desktop-first workflow; Adventure
  Maker is reachable on mobile via the dashboard Session Control card.

## Card contents

Title, status badge (Draft / Ready / In Progress / Archived), two-line
description (or "No description yet."), `0 chapters` (hardcoded until the
chapters table exists next phase), and last-edited date.

## QA

- `npx tsc --noEmit`, `npx eslint`, `npm run build` — all pass; build emits
  both new routes.
- Runtime CRUD tests (create → edit → archive → delete, empty state, card
  click-through) require migration 019 to be applied to Supabase first —
  pending manual run in the Supabase SQL editor.
