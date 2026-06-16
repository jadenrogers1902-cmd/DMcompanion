# D&D Starter Set Character Templates - Coding Agent Handoff

Source: `StarterSet_Characters (1).pdf`

Purpose: make the Starter Set pregenerated characters available as selectable, customizable templates in the DnD Companion app.

## Import Rules

- Load each object in characterTemplates as a selectable player template card.
- Display templateName, playstyleSummary, roleTags, identity, coreStats, and personality on the selection screen.
- After selection, copy the template into a player-owned character instance and keep this pack immutable.
- Require characterName and playerName before finalizing.
- For casters, present prepared spell choices according to the spellcasting object. Keep always-prepared domain spells locked.
- Track sourcePages for audit/debug display.
- Preserve level progression so the app can auto-suggest changes at XP thresholds.
- Use customization.safePlayerEditableFields to decide what the player can edit without DM review.
- Use customization.dmReviewRecommendedFor to flag changes that should be confirmed by the DM.

## Player Finalization Checklist

- characterName
- playerName
- portrait/token
- review personality
- review bond/flaw
- confirm prepared spells if applicable
- confirm equipment
- DM approval

## Templates Included

### Human Fighter - Noble

- Template ID: `starter_human_fighter_noble`
- Source pages: 1, 2
- Role tags: frontline, armored, melee, social_status, leader
- Playstyle: Heavy armor melee fighter with strong Athletics, Persuasion, noble authority, and a greataxe family heirloom.
- Race/Class/Background: Human Fighter 1 / Noble
- Alignment: Lawful neutral
- AC/HP/Speed: AC 17, HP 12, Speed 30 feet
- Ability scores: STR 16, DEX 9, CON 15, INT 11, WIS 13, CHA 14
- Main attacks: Greataxe, Javelin
- Personality traits: My flattery makes those I talk to feel wonderful and important. / I do not like to get dirty, and I will not be caught dead in unsuitable accommodations.
- Ideal: Responsibility. It is the duty of a noble to protect the common people, not bully them.
- Bond: My greataxe is a family heirloom, and it is by far my most precious possession.
- Flaw: I have a hard time resisting the allure of wealth, especially gold. Wealth can help me restore my legacy.
- Personal goal: Civilize Phandalin

Implementation note: use the JSON file as the source of truth. This markdown is a readable index only.

### Hill Dwarf Cleric - Soldier

- Template ID: `starter_hill_dwarf_cleric_soldier`
- Source pages: 3, 4
- Role tags: healer, support, armored, divine_magic, durable
- Playstyle: Armored Life cleric with healing, support magic, strong Medicine, and a soldier background connected to the Rockseeker family.
- Race/Class/Background: Hill dwarf Cleric 1 / Soldier
- Alignment: Neutral good
- AC/HP/Speed: AC 18, HP 11, Speed 25 feet
- Ability scores: STR 14, DEX 8, CON 15, INT 10, WIS 16, CHA 12
- Main attacks: Warhammer, Handaxe
- Spellcasting: Wisdom, DC 13, attack +5
- Cantrips: light, sacred flame, thaumaturgy
- Always prepared domain spells: bless, cure wounds
- Personality traits: I am always polite and respectful. / I do not trust my gut feelings, so I tend to wait for others to act.
- Ideal: Respect. People deserve to be treated with dignity and courtesy.
- Bond: I have three cousins - Gundren, Tharden, and Nundro Rockseeker - who are my friends and cherished clan members.
- Flaw: I secretly wonder whether the gods care about mortal affairs at all.
- Personal goal: Teach the Redbrands a Lesson

Implementation note: use the JSON file as the source of truth. This markdown is a readable index only.

### Lightfoot Halfling Rogue - Criminal

- Template ID: `starter_lightfoot_halfling_rogue_criminal`
- Source pages: 5, 6
- Role tags: stealth, skills, scout, criminal_contact, revenge_hook
- Playstyle: Stealth-focused rogue with Sneak Attack, thieves' tools expertise, social trickery, and a built-in Redbrands revenge hook.
- Race/Class/Background: Lightfoot halfling Rogue 1 / Criminal
- Alignment: Neutral
- AC/HP/Speed: AC 14, HP 9, Speed 25 feet
- Ability scores: STR 8, DEX 16, CON 12, INT 13, WIS 10, CHA 16
- Main attacks: Shortsword, Shortbow
- Personality traits: I never have a plan, but I am great at making things up as I go along. / The best way to get me to do something is to tell me I cannot do it.
- Ideal: People. I am loyal to my friends, not to any ideals. Everyone else can take a trip on the River Styx for all I care.
- Bond: Qelline Alderlead, my aunt, has a farm in Phandalin. I always give her some of my ill-gotten gains.
- Flaw: My aunt must never know the deeds I did as a member of the Redbrands.
- Personal goal: Get Your Revenge

Implementation note: use the JSON file as the source of truth. This markdown is a readable index only.

### High Elf Wizard - Acolyte

- Template ID: `starter_high_elf_wizard_acolyte`
- Source pages: 7, 8
- Role tags: arcane_magic, utility, knowledge, ranged_spells, lore_hook
- Playstyle: Intelligence-based wizard with a strong spellbook, knowledge skills, Oghma faith hook, and future School of Evocation progression.
- Race/Class/Background: High elf Wizard 1 / Acolyte
- Alignment: Chaotic good
- AC/HP/Speed: AC 12, HP 8, Speed 30 feet
- Ability scores: STR 10, DEX 15, CON 14, INT 16, WIS 12, CHA 8
- Main attacks: Shortsword
- Spellcasting: Intelligence, DC 13, attack +5
- Cantrips: mage hand, prestidigitation, ray of frost, shocking grasp
- Spellbook: burning hands, detect magic, mage armor, magic missile, shield, sleep
- Personality traits: I use polysyllabic words that convey the impression of erudition. / I have spent so long in the temple that I have little experience dealing with people on a casual basis.
- Ideal: Knowledge. The path to power and self-improvement is through knowledge.
- Bond: The tome I carry with me is the record of my life's work so far, and no vault is secure enough to keep it safe.
- Flaw: I will do just about anything to uncover historical secrets that would add to my research.
- Personal goal: Reconsecrate the Defiled Altar

Implementation note: use the JSON file as the source of truth. This markdown is a readable index only.

### Human Fighter - Folk Hero

- Template ID: `starter_human_fighter_folk_hero`
- Source pages: 9, 10
- Role tags: ranged, melee, heroic, martial, commoner_hospitality
- Playstyle: Dexterity-forward fighter with strong longbow attacks, greatsword backup, heroic Thundertree goal, and common-folk support.
- Race/Class/Background: Human Fighter 1 / Folk hero
- Alignment: Lawful good
- AC/HP/Speed: AC 14, HP 12, Speed 30 feet
- Ability scores: STR 14, DEX 16, CON 15, INT 11, WIS 13, CHA 9
- Main attacks: Greatsword, Longbow
- Personality traits: When I set my mind to something, I follow through. / I use long words in an attempt to sound smarter.
- Ideal: Sincerity. It is no good pretending to be something I am not.
- Bond: One day, Thundertree will be a prosperous town again. A statue of me will stand in the town square.
- Flaw: I am convinced of the significance of my destiny, and blind to my shortcomings and the risk of failure.
- Personal goal: Drive Off the Dragon

Implementation note: use the JSON file as the source of truth. This markdown is a readable index only.

## JSON Source of Truth

Use `starter_set_character_templates_ingestible.json` for full detail, including all skills, saving throws, proficiencies, equipment, features, race/class/background lore, and level progression.
