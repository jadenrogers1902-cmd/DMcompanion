# Mobile Player Layout Requirements

## Status

The visual-navigation pass was implemented on 2026-07-14. Static checks and
source contracts cover the layout rules below; authenticated viewport and
assistive-technology verification still require a configured player fixture.

## Primary Navigation

- The player phone bar exposes four stable choices: **Home**, **Characters**,
  **Adventure**, and **More**.
- **More** opens one keyboard-accessible sheet containing **Encounters**,
  **Journal**, **Revealed Info**, **Account Settings**, **All Campaigns**, and
  **Join Campaign**. No player destination is hidden or removed.
- The active destination uses `aria-current`; the sheet traps focus, closes with
  Escape or the backdrop, and restores focus to its trigger.
- Desktop navigation keeps the same player destinations in the campaign list.
  DM navigation, ordering, and labels remain separate and unchanged.

## Player Layout Priorities

- Player routes remain phone-first, vertically scrollable, and usable one-handed.
- Interactive controls touched by this pass use a minimum 44px target.
- Campaign Home presents visual destination cards before the Party list.
- Journal, Revealed Info, and character templates show short previews first and
  keep the complete text in native expandable sections.
- Character and encounter screens use icons and status blocks to make HP, AC,
  initiative, conditions, and the current turn faster to identify.
- Adventure keeps the revealed map as its visual focus and labels the Character
  and Actions launchers instead of relying on icon recognition alone.

## Target Viewports

- 375px mobile
- 390px mobile
- 430px large mobile
- 768px tablet

## Preserved Routes and Behavior

- `/campaigns/[id]` remains Campaign Home and still includes the Party list.
- `/campaigns/[id]/live-map` still branches to `PlayerMapView` for players.
- `/campaigns/[id]/characters` still provides character creation, templates,
  sheets, inventory, spells, abilities, notes, conditions, and editing.
- `/campaigns/[id]/encounters` still provides player-visible encounter state.
- `/campaigns/[id]/story` still uses the player Journal branch.
- `/campaigns/[id]/codex` still uses the player-safe Revealed Info branch.
- Existing actions, rolls, movement, travel, realtime refreshes, queries, forms,
  and DM utility surfaces are unchanged.

## Media and Security

- Original destination artwork lives under `public/player-ui/destinations/` and
  is decorative; link text and icons retain the accessible destination names.
- Dynamic player images accept only local app paths or the exact configured
  Supabase Storage origin. Failed or unsupported images fall back to icons.
- Player pages continue to use the existing player-safe snapshot/publication
  inputs, RLS, short-lived signed handout URLs, and protected map-image route.
- No schema, RLS policy, RPC, query scope, or DM/player visibility rule changed.

## Manual Verification Pending

- Authenticated player screenshots and interaction checks at 375px, 390px,
  430px, and 768px.
- Screen-reader announcement order, reduced-motion behavior, and focus return in
  a supported browser/assistive-technology pairing.
