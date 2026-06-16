# Adventure Maker — Phase 3 (Chapters)

## Status

Implemented (2026-06-09). Chapters exist inside adventures with full CRUD,
up/down reordering, breadcrumb navigation, and a chapter workspace shell.
Maps/scenes inside chapters arrive in the next phase. Follows
`docs/ADVENTURE_MAKER_PHASE2.md`.

## Routes

- `/campaigns/[id]/adventures/[adventureId]` — adventure detail now renders
  the real chapter card list (ordered by `sort_order`), Create Chapter button,
  reorder rail, and empty state when no chapters exist.
- `/campaigns/[id]/adventures/[adventureId]/chapters/[chapterId]` — NEW
  chapter workspace: breadcrumb (Adventure Maker / adventure / chapter),
  editable chapter header (title/description/status, delete), and the
  Maps & Scenes empty-state shell for the next phase.

Both DM-only with the same redirect guards as the rest of Adventure Maker.

## Data model

Migration `supabase/migrations/020_adventure_chapters.sql` (run AFTER 019):

- `adventure_chapters`: `id`, `adventure_id` (FK → adventures, cascade),
  `campaign_id` (FK → campaigns, cascade — denormalized so RLS can call
  `is_campaign_dm` without a join), `title`, `description`, `sort_order`
  (int, append-on-create), `status` (same four states as adventures, default
  `draft`), `created_at`, `updated_at` (trigger-maintained).
- RLS: DM-only `FOR ALL` policy; realtime publication + `REPLICA IDENTITY
  FULL` (players receive nothing — RLS filters all rows).

Types: `Chapter` in `lib/types/adventure.ts` is now the real row type;
`adventure_chapters` added to the `Database` type.

## Server actions (`lib/actions/chapters.ts`)

- `createChapter(campaignId, adventureId, { title, description })` — appends
  `sort_order = max + 1`; returns `{ chapterId }`.
- `updateChapter(campaignId, adventureId, chapterId, { title?, description?, status? })`
- `deleteChapter(...)` — redirects back to the adventure detail on success.
- `moveChapter(..., 'up' | 'down')` — swaps `sort_order` with the neighbor
  (with a fallback to index-based values if legacy rows share a sort value);
  no-op at list edges.

## Components (`components/adventures/`)

- `ChapterList.tsx` — nested-feel card list: left reorder rail (up/down +
  position number), stretched-link card body (whole card opens the chapter
  workspace; rail buttons sit above the link), status badge, two-line
  description, map count (0 until scenes exist), last-edited date.
- `CreateChapterButton.tsx` — modal create form, mirrors the adventure one;
  routes into the new chapter workspace on success.
- `ChapterSettingsPanel.tsx` — chapter workspace header: view/edit modes,
  status select, delete with `confirm()`.
- `AdventureBreadcrumbs.tsx` — shared breadcrumb trail used by the adventure
  detail and chapter workspace pages (replaces the Phase 2 back link on the
  adventure detail page).

Adventure cards on the landing page now show REAL chapter counts (one query
for the campaign's chapter `adventure_id`s, counted in memory — replaces the
hardcoded "0 chapters" from Phase 2).

## QA

- `npx tsc --noEmit`, `npx eslint`, `npm run build` — all pass; build emits
  the new chapter route.
- Runtime tests (create/edit/delete/reorder chapters, empty states, correct
  adventure association, breadcrumb navigation) require migration 020 applied
  to Supabase — pending manual run alongside 019.
