# Option 3: Moonlit Grimoire Feature Baseline

**Baseline commit:** `fec33bfbc39ed933b578c40c8e7817e8a159907f`  
**Inventory date:** 2026-07-12  
**Purpose:** Freeze the user-visible feature set before the Moonlit Grimoire visual migration so the DM and player products can be checked for parity afterward.

## Evidence rules

- **Code verified** means the route, component, server action, migration, or policy exists in the baseline source and its wiring was inspected. It does not prove a deployed database or browser workflow.
- **Runtime verified** requires a completed browser/database scenario with recorded evidence. No authenticated runtime session was available while this baseline was written, so no row is marked runtime verified.
- **Blocked** means the check needs authenticated DM/player fixtures, a linked up-to-date Supabase project, or representative gameplay data.
- Historical QA documents are supporting context only. Baseline commit source is authoritative when documentation and code differ.

## Route and role inventory

| Surface | Route(s) | Access at baseline | Expected behavior after theme migration |
|---|---|---|---|
| Entry/auth | `/`, `/login`, `/register`, `/auth/callback` | Public; authenticated users are redirected into the app | Same forms, validation, callback, and redirects |
| Campaign discovery | `/dashboard`, `/campaigns/new`, `/join` | Authenticated | Same owned/joined campaign cards, create, and invite-code join flows |
| Campaign home | `/campaigns/[id]` | Campaign member; content is role-aware | Same overview, members, invite controls, quick links, and session state |
| Campaign settings/export | `/campaigns/[id]/settings`, `/campaigns/[id]/export` | DM-only actions; a player following the sidebar Settings link is redirected to campaign home; export returns `403` for players | Preserve this behavior; do not silently broaden player access or expand export scope |
| Characters | `/campaigns/[id]/characters`, `/new`, `/templates`, `/templates/[templateId]`, `/[charId]`, `/[charId]/edit` | Campaign member with ownership/DM checks | Same party dashboard, personal character flows, templates, sheets, and editing permissions |
| Encounters | `/campaigns/[id]/encounters`, `/new`, `/[encounterId]` | Campaign member; management is DM-controlled | Same encounter list, participants, initiative, turns, HP, conditions, and notes |
| Story/Journal | `/campaigns/[id]/story` | Campaign member; DM sees authoring tools, players see revealed content | Same role-aware Story Tools / Party Journal split |
| Action queue | `/campaigns/[id]/actions` | DM | Same queue cards, filters/states, approval, denial, rolls, notes, damage/state review, nudges, and clear-board confirmation |
| Live maps | `/campaigns/[id]/live-map`, `/new`, `/[mapId]` | DM editor; players are directed to the player tabletop for active map state | Same upload/list/remove/activate, editor tools, tokens, session controls, fog, rooms, walls, travel, portals, party, and Codex linking |
| Center Screen | `/campaigns/[id]/live-map/[mapId]/center-screen` | Campaign-safe display | Same player-safe cast/map projection with no hidden DM data |
| Adventure Maker | `/campaigns/[id]/adventures`, `/[adventureId]`, `/chapters/[chapterId]`, `/maps/[preparedMapId]` | DM | Same adventure/chapter/prep database, prepared map, token builder, SRD lookup, hub, and deployment flows |
| Adventure Codex | `/campaigns/[id]/codex` | DM workspace; player-safe reveals are consumed from campaign/player surfaces | Same manual/Notion documents, relations, search, object links, and reveal scopes |
| Notion bridge | `/campaigns/[id]/codex/notion`, `/schema`, `/sync`, `/api/notion/webhook` | DM; secrets/server operations remain private | Same mapping, discovery, schema, manual sync, retry/cleanup, webhook, and health views |
| APIs/assets | `/api/srd`, `/api/campaigns/[id]/maps/[mapId]/image` | Scoped by endpoint and campaign access | Same lookup and protected map-image behavior |

## Feature parity matrix

Every row is a release requirement. “Post-theme verification” is intentionally written as an executable check, not a visual opinion.

### Shared shell, access, and campaign management

| ID | Role | Baseline feature and states | Source/dependency evidence | Baseline status | Post-theme verification |
|---|---|---|---|---|---|
| SH-01 | Public | Login with email/password; submit loading and server error; link to registration | Auth pages and `lib/actions/auth.ts` | Code verified | Unauthenticated browser: labels, submission, error, link, keyboard focus, mobile layout |
| SH-02 | Public | Registration with display name, email, password/confirmation; validation and success/error | Register page and `register` action | Code verified | Create disposable account or exercise validation-only fixture; confirm redirect contract |
| SH-03 | Shared | Authenticated shell redirects unauthenticated users, renders desktop sidebar, role-aware mobile nav, logout, loading and campaign error states | `(app)/layout.tsx`, `Sidebar`, `MobileNav`, loading/error routes | Code verified | Test redirect plus DM/player nav at desktop and mobile widths; no clipped/fixed controls |
| SH-04 | Shared | Global connection degradation banner, action notification widget, player roll popup, party messages, Codex reveal notices | Global layout listeners and realtime hooks | Code verified; runtime blocked | Simultaneous contexts; disconnect/reconnect; ensure one alert and restored subscriptions |
| CM-01 | Shared | Dashboard separates owned and joined campaigns; empty state; create and join entry points | Dashboard, campaign cards | Code verified | DM and player fixtures see correct cards and links on desktop/mobile |
| CM-02 | Shared | Create campaign and join by eight-character invite code with validation/error states | Campaign actions `createCampaign`, `joinCampaign` | Code verified | Create then join with Player 1; invalid code remains usable and readable |
| CM-03 | DM | Campaign overview, invite code copy/regeneration, member list, campaign details, player removal, session start/end | Campaign page/settings; campaign/session actions | Code verified; runtime blocked | Exercise each confirmation/success/error state and verify role gate |
| CM-04 | DM | JSON backup export of the baseline v1 table set; no restore/import and no newer Codex/adventure tables | Export route | Code verified | DM receives download; player gets `403`; preserve current payload scope exactly |
| CM-05 | Shared | PWA manifest, safe-area mobile navigation, offline/degraded messaging | `manifest.ts`, app shell/status components | Code verified | Inspect manifest; mobile portrait/landscape; browser offline/online recovery |

### Characters, encounters, and story

| ID | Role | Baseline feature and states | Source/dependency evidence | Baseline status | Post-theme verification |
|---|---|---|---|---|---|
| CH-01 | Shared | Character list split between owned and party characters; DM party dashboard | Character routes and `DMCharacterDashboard` | Code verified | DM and player see the same permitted character sets after theme change |
| CH-02 | Shared | Create from scratch or starter template; finalize template; edit/delete under ownership/DM rules | Character/template actions and forms | Code verified; runtime blocked | Create, edit, finalize template, delete; Player 1 cannot edit Player 2’s character |
| CH-03 | Shared | Character sheet identity/stats, HP/temp HP, AC, movement, abilities, inventory, spells, conditions, player notes and DM notes | Character sheet tabs and character actions | Code verified; runtime blocked | Exercise add/remove/save states and verify DM-only notes never appear to player |
| EN-01 | DM | Encounter create/list/detail; add manual, character, and token participants | Encounter routes/actions | Code verified | Create fixture encounter and all participant types; empty/populated states |
| EN-02 | DM | Start/end encounter, initiative/turn movement, participant HP, visibility, conditions, player note and DM note | `EncounterManager`, encounter actions | Code verified; runtime blocked | Run full turn cycle; confirm player-safe fields and hidden DM note boundary |
| ST-01 | DM | Create/delete quests, NPCs, locations, notes, handouts, recaps; upload handout; toggle visibility/reveal | `StoryWorkspace`, story actions, Storage | Code verified; runtime blocked | Exercise each record type, upload/error/empty states, and visibility toggle |
| ST-02 | Player | Party Journal shows only revealed quests/NPCs/locations/notes/handouts/recaps | Player branch of `StoryWorkspace`, RLS | Code verified; runtime blocked | Reveal one of each; Player 1 sees revealed records only and no authoring controls |

### Actions, rolls, and party messaging

| ID | Role | Baseline feature and states | Source/dependency evidence | Baseline status | Post-theme verification |
|---|---|---|---|---|---|
| AC-01 | Player | Select action/tool/target, submit/cancel request, and see pending/review/resolved outcome | `ActionCenter`, action-intent actions | Code verified; runtime blocked | Submit each supported action type; ensure mobile tray scrolls and buttons remain reachable |
| AC-02 | DM | Queue cards expand progressively; DM response/private note; approve, deny, require roll, resolve attack, clear board | Actions page, queue controls, clear confirmation | Code verified; runtime blocked | Use seeded states; verify all controls, labels, confirmations, and transitions |
| AC-03 | Shared | Generic and attack roll requests, automatic/manual rolls, modifier options/warnings, critical outcomes, result reveal | Roll popup/effects and roll-request actions | Code verified; runtime blocked | DM sends roll; intended player returns result; DM sees private detail; reveal is player-safe |
| AC-04 | Shared | Manual/automatic HP effects and pending state suggestions can be approved/rejected | Action controls, state-update and roll actions | Code verified; runtime blocked | Resolve damage/healing/state suggestions and confirm character/token state updates once |
| AC-05 | Shared | DM nudge highlights only matching request; meeting, announcement, whisper, acknowledgement | Party listeners and party-message actions | Code verified; runtime blocked | Target Player 1 and request; Player 2 unaffected; acknowledgements clear without duplicates |

### Adventure Maker and prepared maps

| ID | Role | Baseline feature and states | Source/dependency evidence | Baseline status | Post-theme verification |
|---|---|---|---|---|---|
| AM-01 | DM | Adventure create/update/delete and ordered chapter create/update/delete/reorder/live state | Adventure/chapter routes and actions | Code verified | Exercise empty/populated and destructive confirmations |
| AM-02 | DM | Prep database fields for adventures, chapters, and maps: prep notes, important links, tags | Prep panels; migration `022` | Code verified; runtime blocked | Save/reload each level; verify internal scrolling and long-content layout |
| AM-03 | DM | Prepared map create/image/remove/delete, grid, rooms, fog/reveals, walls, tokens, portals and autosave | `PreparedMapEditor`, prepared-map actions | Code verified; runtime blocked | Open every toolbar/menu/sheet and reload persisted map state |
| AM-04 | DM | Token builder supports scenery/entity tokens, Codex links, dynamic/static behavior, player/DM fields, SRD lookup | Token builder/detail/resource components | Code verified; runtime blocked | Add/edit/remove each token class; lookup optional; verify hidden/private field treatment |
| AM-05 | DM | Chapter hub and prepared-map deployment modes preserve source tracking and preview warnings | Hub/deployment controls and prepared-map actions | Code verified; runtime blocked | Exercise create-new, replace/update, and alternate deployment choices exposed by dialog |

### Live map, player tabletop, and Center Screen

| ID | Role | Baseline feature and states | Source/dependency evidence | Baseline status | Post-theme verification |
|---|---|---|---|---|---|
| LM-01 | DM | Upload/list/delete/activate maps; campaign session controls; grid settings persisted/realtime | Live-map routes, uploader/editor, map/session actions | Code verified; runtime blocked | Upload fixture, activate, start/end session, edit grid, reload and observe second context |
| LM-02 | DM | Token add/edit/delete/filter; visibility/discoverability; class defaults; movement/combat/action settings; DM notes | Map editor/canvas and map actions | Code verified; runtime blocked | Exercise every token panel, context menu, class control, and save/error state |
| LM-03 | DM | Fog/reveal override, painted revealed areas, room masks/doors/borders, walls, map light/cast configuration | Map editor; migrations `052`, room/fog/wall migrations | Code verified; runtime blocked | Test reveal/hide/clear without deleting masks; edit room/door/wall; verify overlay contrast |
| LM-04 | DM | Party players panel, movement locks/resets/overrides, travel options/parties, portals/transports, discoveries | Map/transport actions and party panel | Code verified; runtime blocked | Exercise invitations/review/confirmation and transport destination flows |
| LM-05 | Player | Player-safe active map, zoom/pan/grid, hints/discoveries, owned-token movement, collision/range rules, target/action tray | `PlayerMapView`, safe map reads/RPCs, movement actions | Code verified; runtime blocked | Player 1 moves own token only; walls/range/lock enforced; overlays usable on phone/landscape |
| LM-06 | Player | Character panel, party controls, travel confirmation, portal hints, Codex-linked details | `PlayerMapView` drawers/dialogs | Code verified; runtime blocked | Open/close every drawer/dialog; long content scrolls; close/back controls remain reachable |
| LM-07 | Center Screen | Player-safe map/cast display honors token and room visibility and configured cast settings | Center Screen route/view and migration `052` | Code verified; runtime blocked | Compare with player projection; inspect DOM/network for absence of hidden rows/fields |
| LM-08 | Shared | Token positions, map settings, visibility, fog/rooms/walls/travel/reveals update without refresh and recover after channel degradation | `useTokenRealtime`, `useRealtimeRefresh` | Code verified; runtime blocked | DM + two players + Center Screen; change each state; disconnect/reconnect; no duplicate alerts |

### Adventure Codex and Notion bridge

| ID | Role | Baseline feature and states | Source/dependency evidence | Baseline status | Post-theme verification |
|---|---|---|---|---|---|
| CX-01 | DM | Create/update/search/filter manual and Notion-backed Codex docs; DM summary/notes, player summary, status/type/source | Codex workspace and actions | Code verified; runtime blocked | Create/edit/search each source/type; verify empty/loading/error panels |
| CX-02 | DM | Relate docs; link to live/prepared objects; unlink; targeted or party reveal | Codex actions and linked-doc panels | Code verified; runtime blocked | Link visible/hidden objects and reveal to party/Player 1; verify scope |
| CX-03 | Player | Revealed Info and object-linked details use publications/RPCs rather than private source tables | `campaign_doc_publications`, link publications, player-safe RPC | Code verified; runtime blocked | Player client reads safe projections; hidden/private source rows unavailable |
| NT-01 | DM | Save/test/disable Notion token, connection status, optional auto-sync | Settings card and notion-settings actions | Code verified; runtime blocked | Verify secret never reaches browser; exercise success/error/disabled states |
| NT-02 | DM | Discover databases/tables, map schemas/properties, test mappings, auto-import, delete and orphan cleanup | Notion mapping/schema views and actions | Code verified; runtime blocked | Use test Notion workspace or recorded fixture; verify every mapping state |
| NT-03 | DM | Sync one/all/doc, retry failures, wipe local Codex data, sync logs/health and optional webhook | Sync dashboard, sync actions, webhook route | Code verified; runtime blocked | Exercise non-destructive sync fixture; confirm confirmations, logs, realtime refresh, and error privacy |

## Privacy and realtime invariants

These are parity requirements, not optional security enhancements:

1. `campaign_docs` and `campaign_doc_links` remain DM-only sources. Players consume publications or player-safe RPC results.
2. Center Screen receives only player-safe map/cast data; hidden rooms, tokens, notes, and private combat detail must not exist in its payload or DOM.
3. Player action results omit hidden AC, DM notes, private roll breakdowns, and unapplied pending state.
4. Player 1 cannot read or mutate Player 2’s character, targeted reveals, roll requests, whispers, or token controls.
5. Realtime publications must not mix DM-only and player-readable fields because Supabase change events can carry the complete row.
6. Theme work must not modify migrations, RLS policies, RPC signatures, server-action parameters, API response contracts, or realtime channel subjects.

## Required final evidence

The completed migration must populate `OPTION3_THEME_FINAL_QA.md` with:

- `npm.cmd run audit:theme`, typecheck, lint, build, and Playwright results.
- A status for every matrix ID above; no omitted rows.
- DM, Player 1, Player 2, and Center Screen runtime evidence for all blocked privacy/realtime rows.
- Desktop (`1440×900`), mobile (`375×812`, `430×932`), mobile landscape (`844×390`), and Center Screen (`1920×1080`) screenshots for representative surfaces.
- Explicit blocked coverage if credentials, migrations, or fixtures remain unavailable. A static pass must never be described as authenticated runtime proof.
