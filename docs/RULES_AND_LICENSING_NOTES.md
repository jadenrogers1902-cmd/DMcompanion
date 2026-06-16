# Rules and Licensing Notes

## Core Principle

**Do not store, reproduce, or serve copyrighted DnD sourcebook content.**

This app is a campaign management tool. It is not a rulebook, monster manual, or spell reference. All structured game data stored in the database must be user-created or homebrew.

---

## What We Will Not Store

The following content from official DnD publications (Wizards of the Coast / Hasbro) must NOT be stored in the database or served by this app:

- Full spell descriptions or spell lists from official books
- Monster stat blocks from the Monster Manual or other sourcebooks
- Class features, subclass descriptions, or level progression tables from official books
- Race/species ability descriptions from official books
- Feats, backgrounds, or equipment descriptions from official books
- Adventure text, room descriptions, or story content from published modules
- Any text that would constitute reproduction of a DnD product

---

## What Is Allowed

The following is acceptable to store:

- **User-created content:** Custom monsters, homebrew spells, original NPC descriptions, and player-written backstories
- **Simple labels and references:** Spell names, condition names, damage types, and class names as labels (not descriptions)
- **User notes:** Freeform notes written by the DM or player in their own words
- **Links to external references:** We may link to the official D&D Beyond system reference document (SRD) or other Creative Commons-licensed rule references, but we do not embed that content
- **SRD-covered content:** Wizards of the Coast publishes a [System Reference Document (SRD)](https://www.dndbeyond.com/srd) under a Creative Commons Attribution 4.0 license. Content within the SRD may be referenced, but should still not be bulk-embedded in the database

---

## Linking vs Embedding

If a user needs to look up a spell or rule, the app may:
- Link them to D&D Beyond or the SRD
- Allow them to type their own notes/summary
- Allow them to paste homebrew content they authored

The app may **not**:
- Automatically populate a spell description from an internal database of WotC content
- Pre-fill monster stat blocks from official books
- Provide a built-in browsable rulebook

---

## System Flexibility

Where possible, avoid hard-coding DnD 5e assumptions:

- Use flexible text fields rather than rigid select menus locked to 5e mechanics
- Allow users to enter custom class names, custom races, or custom conditions
- Do not build the combat system around 5e-specific action economy (action, bonus action, reaction) — let users track this manually via notes

This keeps the app usable for other TTRPG systems in the future (Pathfinder, OSR, homebrew systems).

---

## SRD Resource Lookup (Adventure Maker Phase 8)

The token resource lookup queries **Open5e** (`api.open5e.com`) but pins every request
to `document__slug=wotc-srd` — the WotC SRD 5.1 under CC BY 4.0 — so third-party OGL
documents Open5e also hosts are excluded. We **reference, not embed**: an attached
resource stores only a name, a short generated summary, a few metadata highlights, and
a link to the source. Full stat blocks / spell text are never stored. The lookup is
optional and writes only to the token's `resource` field, never to DM-written notes.
See `lib/srd/open5e.ts` and `docs/ADVENTURE_MAKER_PHASE8.md`.

---

## Third-Party Content

- Do not integrate with any third-party DnD content API without first verifying that API's license terms
- D&D Beyond's API is not public; do not scrape or reverse-engineer it
- The Open Game License (OGL) situation has evolved — rely on clearly licensed SRD content (CC BY 4.0) only

---

## User-Uploaded Content

- Users may upload images (maps, tokens, handouts) — they are responsible for having rights to those images
- The app should include a brief acknowledgment in the terms of service that users must own or have rights to content they upload
- Do not serve user-uploaded content publicly without access controls (use Supabase Storage private buckets)

---

## Summary Checklist

- [ ] No WotC sourcebook text is stored in the database
- [ ] No automated rules enforcement that requires reproducing book content
- [ ] Spell/ability references are user-entered, not auto-populated from books
- [ ] External links point to official or SRD sources, not embedded copies
- [ ] User-uploaded files are stored in private Supabase Storage buckets
- [ ] Terms of service acknowledges user content responsibility
