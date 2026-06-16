# Adventure Maker Phase 8 - Token Resource Lookup (Public SRD Enrichment)

## Status

Code complete. Builds, lints, and type-checks. Unauthenticated route smoke test
passes (401). Full happy-path runtime QA needs a signed-in DM session.

**No database migration is required** — the attached resource is stored inside the
existing `prepared_maps.tokens` JSONB column.

## Scope

Adds an *optional* public SRD-compatible resource lookup to prepared tokens. From a
token's detail drawer, the DM can search the 5e SRD by name, pick a result, and
attach a compact reference to the token. Lookup is never required to create or edit a
token, and attached resource data is stored completely separately from DM-written
notes.

## APIs Investigated

| API | Notes |
|---|---|
| **Open5e** (`api.open5e.com`) | Broad: monsters, spells, magic items, weapons, armor, more. Supports `search=` and filtering by source document (`document__slug`). Exposes per-record license metadata. Hosts the WotC SRD **and** third-party OGL documents. |
| **D&D 5e API** (`dnd5eapi.co`) | Clean SRD 5.1 (CC BY 4.0), but narrower surface and now served under `/api/2014/…`. Pure-SRD only. |
| **5e SRD mirrors** (`5e.tools`, `d20srd.org`) | Not first-class JSON search APIs / unclear redistribution terms — not used. |

## API Chosen And Why

**Open5e**, constrained to `document__slug=wotc-srd`.

- One API covers all five categories the phase calls for with a uniform `search` query.
- The `document__slug=wotc-srd` filter restricts results to the **WotC System
  Reference Document 5.1**, published under **Creative Commons Attribution 4.0**.
  Open5e's third-party OGL documents (Tome of Beasts, Vault of Magic, Advanced 5e,
  etc.) are deliberately excluded so we stay within
  `docs/RULES_AND_LICENSING_NOTES.md` ("rely on clearly licensed SRD content
  (CC BY 4.0) only").

## Files Changed / Created

- `lib/srd/open5e.ts` *(new)* — shared, server-safe SRD module: categories, the
  `wotc-srd` constraint, per-category summary/metadata extraction, result mapping,
  and `TokenResourceRef` construction.
- `app/api/srd/route.ts` *(new)* — auth-gated, cached GET proxy to Open5e.
- `components/adventures/TokenResourceLookup.tsx` *(new)* — client search/attach UI
  with loading, empty, and error states.
- `components/adventures/TokenDetailPanel.tsx` — renders the lookup section.
- `components/adventures/token-meta.ts` — `normalizeTokenResource()` helper; token
  normalization now carries the `resource` field.
- `components/adventures/PreparedMapEditor.tsx` — new tokens initialize `resource: null`.
- `lib/actions/prepared-maps.ts` — `sanitizeTokens()` re-normalizes `resource`
  server-side (defense in depth).
- `lib/types/adventure.ts` — `TokenResourceRef` type and `PreparedMapToken.resource`
  field (scaffolded earlier; now fully wired and the code compiles).

## Resource Lookup Behavior

1. The drawer shows an **SRD Resource (optional)** section. The category defaults from
   the token type (`item`/`loot` → Magic Items; everything else → Monsters) and is
   freely changeable (Monsters, Spells, Magic Items, Weapons, Armor).
2. The DM types a name (≥ 2 chars) and searches. The client calls `/api/srd`, which
   verifies the session, validates the category/query, and queries Open5e with the
   `wotc-srd` filter.
3. Results render as a short list (name + one-line summary). Selecting one attaches it.
4. **States handled:** loading (spinner on Search), empty ("No SRD matches…"), and
   error ("Lookup failed…" / provider/non-OK status). A ≥2-char minimum is enforced on
   both client and server.
5. An attached resource renders as a card: name, category badge, summary, capped
   metadata chips, a "View source data ↗" link, the provider, and the sync date.
   **Detach** clears it (`resource: null`). Re-searching replaces it.

## Data Storage Behavior

`PreparedMapToken.resource: TokenResourceRef | null` is persisted inside
`prepared_maps.tokens` JSONB. The stored shape is intentionally slim:

- `source` (`open5e`), `source_id` (slug), `source_url` (stable Open5e API detail URL)
- `category`, `name`, `summary` (one line), `metadata` (≤ 12 short key→value highlights)
- `synced_at` (ISO timestamp of the fetch)

We **never** store the full stat block / spell text — only a reference, a short
summary, and a link. `normalizeTokenResource()` caps every field on load and on save.

## Custom Note Protection

- The resource lives in its own field; the lookup UI only ever calls
  `onChange({ resource })` / `onChange({ resource: null })`. It never reads or writes
  `dm_notes`, `player_notes`, `description`, `prep_notes`, or `links`.
- Attaching, replacing, or detaching a resource leaves all DM-written notes untouched.
- DM-only notes are not exposed by this feature; the route returns only public SRD data.

## Legal / Licensing Notes

- Source is the WotC SRD 5.1 (CC BY 4.0) via Open5e, enforced by
  `document__slug=wotc-srd` on every request.
- We **link, don't embed**: only a name, a short generated summary, and a few
  highlights are stored, plus a URL back to the source data — consistent with
  `docs/RULES_AND_LICENSING_NOTES.md`.
- No large datasets are hard-coded or bundled. No scraping. D&D Beyond's private API
  is not touched.

## Caching

The route fetches Open5e with `next: { revalidate: 86400 }`, so identical SRD queries
are served from Next's data cache for a day (public, effectively immutable data). An
8-second request timeout (`AbortSignal.timeout`) bounds slow provider responses.

## Manual QA Results

- [x] `npx.cmd tsc --noEmit` passes.
- [x] `npm.cmd run lint` passes.
- [x] `npm.cmd run build` passes; `/api/srd` registers as a dynamic route.
- [x] Unauthenticated `GET /api/srd?...` → `401 {"error":"Not authenticated."}`.
- [ ] Authenticated DM happy path: search → attach → save → reload (needs a session).
- [ ] Attaching/detaching a resource leaves DM/player notes unchanged (visual check).
- [ ] Empty-result and provider-error states render correctly in the drawer.
- [ ] Mobile drawer: the lookup section does not overflow.

## Out Of Scope (per the phase brief)

- No Live Map sync of resources (`sendPreparedMapToLiveMap` is unchanged; resource is
  prep-only).
- No changes to the action/roll system.
- No required lookup, no auto-population of DM notes.

## Known Limitations

- `source_url` points to the Open5e **API** detail endpoint (stable across all
  categories). The Open5e website pages are unreliable for some categories (magic
  items 404), so the API URL is used as the canonical, always-valid link.
- Only the WotC SRD subset is searchable by design; homebrew/third-party content is
  intentionally excluded.
- Tags/metadata are per-token; there is no global resource cache table — Next's data
  cache covers repeat lookups instead.
