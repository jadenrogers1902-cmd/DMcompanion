# Audit Hardening Handoff

**Date:** 2026-07-13
**Status:** implemented and statically verified in the working tree; not deployed

Read this document and the other app docs before changing or releasing this
work, especially:

- `docs/QA_Reports/FULL_APP_CODE_AUDIT_2026-07-12.md`
- `docs/DEPLOYMENT.md`
- `docs/PROJECT_SOURCE_OF_TRUTH.md`
- `docs/FEATURE_SCOPE.md`
- `docs/Implementation_Log.md`
- `docs/ChangeLog.md`

## Release unit

Application code and
`supabase/migrations/20260713041904_player_safe_live_projections.sql` are one
atomic release unit. The code expects the safe snapshot/event/RPC contract; the
migration removes player access to the retired mixed-privacy source contract.
Do not ship either side alone.

The release also requires a valid server-only `SUPABASE_SERVICE_ROLE_KEY` for
protected map delivery, validated action/roll writes, transport, and existing
server integrations. Never expose or log that key.

## What changed

- Player and Center Screen Live Map data now use revision-only events plus
  sanitized snapshot RPCs. Story players use the equivalent safe Story contract.
- Mixed-privacy map, Story, travel, combat, and Storage source reads are closed
  to players. Map images are authorized and proxied by the protected route.
- Action intent, roll/result, travel-party/member, and confirmation mutations
  are server/RPC-owned rather than broadly writable through PostgREST.
- Movement requires current membership, the active map, and a visible controlled
  token. Door gaps are local to the crossing, and every group follower path is
  checked before a group move starts.
- Map activation is transactional. Realtime snapshot/channel recovery uses
  capped exponential backoff with jitter.
- Proxy matching/auth headers, map image caching, action-widget work, Story
  handout signing, redundant refreshes, mobile scrolling/touch targets, reduced
  motion, and dialog focus behavior were tightened.

## Pre-promotion checks

From the exact release commit:

```powershell
npx.cmd tsc --noEmit
npm.cmd run test:unit
npm.cmd run audit:theme
npm.cmd run lint
npm.cmd run build
git diff --check
```

Then confirm the intended Supabase target, stage the matching Vercel build,
enter a controlled maintenance window, apply migrations with
`npm.cmd run db:migrate`, and immediately promote the staged build.

## Required runtime proof

Use disposable DM, Player 1, and Player 2 identities plus a Center Screen. At a
minimum verify:

- players cannot select source map/Story/travel rows or map Storage objects;
- safe snapshots contain no DM notes, source paths/links, numeric target AC,
  wall labels, hidden portals, or private combat detail;
- Player 1 cannot move Player 2, a hidden retained token ID, an inactive-map
  token, or any token after campaign removal;
- forged direct action/roll/travel table writes are denied;
- nearby doors permit crossing, distant crossings on the same edge do not, and
  a blocked follower prevents the whole group move;
- reveal/hide, rooms, walls, tokens, travel, active-map switches, Story reveals,
  disconnect, and reconnect propagate once to all intended contexts;
- keyboard focus, Escape/backdrop dismissal, mobile scrolling, landscape reach,
  and reduced motion work on representative screens;
- protected map images cache across token/grid/fog changes, while replacement
  images produce a new cache identity;
- hidden handouts stop producing new URLs (allowing the documented five-minute
  maximum lifetime for an already-issued URL).

Capture before/after Vercel and Supabase usage for the bounded fixture run using
the caps in the full audit report.

## Rollback warning

Do not roll back only the code or only the migration. If promotion fails, keep
traffic in maintenance mode and restore a mutually compatible code/database
pair. Reopening the old player source policies while new clients are active can
reintroduce private realtime payloads and forged-write paths.

## Known blocked evidence

No migration was applied and no deployed/authenticated multi-role, visual,
accessibility, provider-advisor, or usage-dashboard pass was available during
this implementation. The handoff does not claim production readiness by itself.
