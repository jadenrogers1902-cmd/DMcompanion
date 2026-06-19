# Companion

Companion is a Next.js/Supabase tabletop campaign app for running live D&D-style sessions, managing campaign documentation, and safely revealing information to players.

## Architecture Principles

- **Notion is a documentation source.** It can provide prep notes, lore, locations, NPCs, rumors, factions, quests, and reference text.
- **Adventure Codex is the app-safe cache.** Notion content is normalized into `campaign_docs` and related Codex tables before it appears in the app.
- **The live engine owns gameplay state.** Token position, HP, initiative, dice, action approvals, fog, map reveal state, movement, combat, and active session state are owned by Companion, not Notion.
- **Player-safe reveal rules are enforced.** Players read safe projection tables/RPCs and scoped reveal records; they do not subscribe to DM-only Codex source tables.
- **Notion sync never controls combat or map state.** Synced combat stats are treated as DM reference text until a dedicated structured stat-mapping feature exists.

## Local Development

Read the local Next.js 16 docs before changing routing, server actions, proxy behavior, or request APIs:

```bash
node_modules/next/dist/docs/
```

This project uses the Next.js 16 `proxy.ts` convention rather than the older `middleware.ts` convention.

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Verification Gates

Use these gates for Adventure Codex, Notion sync, and live-map bridge changes:

```bash
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
npx.cmd playwright test tests/e2e/app-smoke.spec.ts
```

Authenticated runtime QA requires:

```text
E2E_DM_EMAIL
E2E_DM_PASSWORD
E2E_CAMPAIGN_ID
```

Use the fail-fast helper before running authenticated QA:

```bash
npm.cmd run check:e2e-env
npm.cmd run test:e2e:auth
```

If those values are absent, the helper prints the exact `.env.local` keys to add
instead of letting authenticated tests silently skip.

Apply Supabase migrations without using the SQL editor:

```bash
npm.cmd run db:migrate
```

`db:migrate` derives the project ref from `NEXT_PUBLIC_SUPABASE_URL` or
`SUPABASE_PROJECT_REF`, links the Supabase CLI, then runs `supabase db push`.
For unattended runs, set `SUPABASE_ACCESS_TOKEN`. The GitHub Actions workflow
`.github/workflows/supabase-migrations.yml` runs the same command on pushes to
`main` that change `supabase/migrations/**` when repository secrets
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` are configured.

Notion API runtime QA also requires the relevant Supabase migrations plus server-only environment values such as `SUPABASE_SERVICE_ROLE_KEY`, and optional webhook QA requires `NOTION_WEBHOOK_SECRET` and a public HTTPS deployment.

## Documentation

- `docs/AdventureCodex_NotionBridge.md` - source of truth for Codex/Notion architecture and rollback notes.
- `docs/Implementation_Log.md` - phase-by-phase implementation notes.
- `docs/ChangeLog.md` - compact phase change records.
- `docs/QA_Reports/AdventureCodex_QA.md` - manual and static QA checklists.
- `docs/QA_Reports/AdventureCodex_Phase12_Final_QA_Report.md` - final QA/regression report for Adventure Codex, Notion sync, and live-map bridge.
