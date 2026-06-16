import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Textarea, Input } from '@/components/ui/Input'
import {
  getTemplateSummary,
  type CharacterTemplate,
  type TemplateSpellcasting,
} from '@/lib/character-templates'
import { finalizeCharacterTemplate } from '@/lib/actions/character-templates'

function Section({
  title,
  children,
  open = false,
}: {
  title: string
  children: React.ReactNode
  open?: boolean
}) {
  return (
    <details open={open} className="rounded-lg border border-zinc-800 bg-zinc-950">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-zinc-100 marker:text-amber-400">
        {title}
      </summary>
      <div className="border-t border-zinc-800 px-4 py-4">{children}</div>
    </details>
  )
}

function SimpleList({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return <p className="text-sm text-zinc-600">None listed.</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item} className="text-sm leading-relaxed text-zinc-300">
          {item}
        </li>
      ))}
    </ul>
  )
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function StatGrid({ template }: { template: CharacterTemplate }) {
  const stats = [
    ['AC', template.coreStats.armorClass],
    ['Initiative', template.coreStats.initiative >= 0 ? `+${template.coreStats.initiative}` : template.coreStats.initiative],
    ['Speed', `${template.coreStats.speed.value} ${template.coreStats.speed.unit}`],
    ['Max HP', template.coreStats.hitPointMaximum],
    ['Hit Dice', template.coreStats.hitDice.total],
    ['Passive Perception', template.coreStats.passiveWisdomPerception],
    ['Proficiency', `+${template.coreStats.proficiencyBonus}`],
    ['XP', template.identity.experiencePoints ?? 0],
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-lg font-bold text-zinc-100">{value}</p>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
        </div>
      ))}
    </div>
  )
}

function SpellcastingSummary({ spellcasting }: { spellcasting: TemplateSpellcasting | null }) {
  if (!spellcasting) return <p className="text-sm text-zinc-500">This template is not a spellcaster.</p>
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-sm font-semibold text-zinc-100">{spellcasting.ability}</p>
          <p className="text-xs text-zinc-500">Spellcasting ability</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-sm font-semibold text-zinc-100">{spellcasting.spellSaveDC}</p>
          <p className="text-xs text-zinc-500">Save DC</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-sm font-semibold text-zinc-100">+{spellcasting.spellAttackBonus}</p>
          <p className="text-xs text-zinc-500">Spell attack</p>
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Cantrips</h4>
        <SimpleList items={spellcasting.cantripsKnown} />
      </div>
      {spellcasting.spellbook && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Spellbook</h4>
          <SimpleList items={spellcasting.spellbook} />
        </div>
      )}
      {spellcasting.alwaysPreparedDomainSpells && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Always Prepared / Domain</h4>
          <JsonBlock value={spellcasting.alwaysPreparedDomainSpells} />
        </div>
      )}
      {spellcasting.preparedSpellsRule && (
        <p className="text-sm text-zinc-400">{spellcasting.preparedSpellsRule}</p>
      )}
    </div>
  )
}

export function CharacterTemplateCards({
  campaignId,
  templates,
}: {
  campaignId: string
  templates: CharacterTemplate[]
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {templates.map((template) => {
        const summary = getTemplateSummary(template)
        return (
          <Card key={template.id} className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">{summary.name}</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {summary.race} · {summary.className} {summary.level} · {summary.background}
                </p>
              </div>
              <Badge variant={summary.spellcaster ? 'success' : 'default'}>
                {summary.spellcaster ? 'Caster' : 'Martial'}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed text-zinc-300">{summary.role}</p>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-zinc-950 p-3">
                <dt className="text-xs text-zinc-500">Alignment</dt>
                <dd className="text-zinc-200">{summary.alignment}</dd>
              </div>
              <div className="rounded-lg bg-zinc-950 p-3">
                <dt className="text-xs text-zinc-500">Combat style</dt>
                <dd className="text-zinc-200">{summary.combatStyle}</dd>
              </div>
              <div className="rounded-lg bg-zinc-950 p-3 sm:col-span-2">
                <dt className="text-xs text-zinc-500">Spellcasting</dt>
                <dd className="text-zinc-200">{summary.magicType}</dd>
              </div>
            </dl>
            <div className="mt-auto flex flex-wrap gap-2">
              <Link href={`/campaigns/${campaignId}/characters/templates/${template.id}`}>
                <Button type="button" variant="secondary" size="sm">View Template</Button>
              </Link>
              <Link href={`/campaigns/${campaignId}/characters/templates/${template.id}#finalize`}>
                <Button type="button" size="sm">Choose This Character</Button>
              </Link>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export function CharacterTemplateDetail({
  campaignId,
  template,
}: {
  campaignId: string
  template: CharacterTemplate
}) {
  async function finalize(formData: FormData) {
    'use server'
    await finalizeCharacterTemplate(campaignId, template.id, formData)
  }
  const spellcasting = template.attacksAndSpellcasting.spellcasting
  const spellOptions = spellcasting?.spellbook ?? []

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-zinc-100">{template.templateName}</h1>
              <Badge variant={spellcasting ? 'success' : 'default'}>
                {spellcasting ? 'Spellcaster' : 'Starter'}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              {template.identity.race} · {template.identity.class} {template.identity.level} · {template.identity.background} · {template.identity.alignment}
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-300">{template.playstyleSummary}</p>
          </div>
          <Link href={`/campaigns/${campaignId}/characters/templates#${template.id}`}>
            <Button type="button" variant="secondary" size="sm">Back to templates</Button>
          </Link>
        </div>
      </Card>

      <Section title="Overview" open>
        <div className="flex flex-col gap-4">
          <StatGrid template={template} />
          <div className="flex flex-wrap gap-2">
            {(template.roleTags ?? []).map((tag) => (
              <span key={tag} className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Core Stats">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <JsonBlock value={template.abilityScores} />
          <JsonBlock value={template.coreStats} />
        </div>
      </Section>

      <Section title="Skills">
        <JsonBlock value={template.skills} />
      </Section>

      <Section title="Saving Throws">
        <JsonBlock value={template.savingThrows} />
      </Section>

      <Section title="Combat">
        <JsonBlock value={template.attacksAndSpellcasting.attacks} />
      </Section>

      <Section title="Spellcasting">
        <SpellcastingSummary spellcasting={spellcasting} />
      </Section>

      <Section title="Features And Traits">
        <div className="flex flex-col gap-3">
          {template.featuresAndTraits.map((feature) => (
            <div key={`${feature.source}-${feature.name}`} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">{feature.name}</h3>
                <span className="text-xs text-zinc-500">{feature.source}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">{feature.description}</p>
              {feature.uses && <p className="mt-2 text-xs text-amber-300">{feature.uses}</p>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Equipment">
        <JsonBlock value={{ equipment: template.equipment, currency: template.currency }} />
      </Section>

      <Section title="Proficiencies And Languages">
        <JsonBlock value={template.proficienciesAndLanguages} />
      </Section>

      <Section title="Personality">
        <JsonBlock value={template.personality} />
      </Section>

      <Section title="Backstory And Personal Goal">
        <JsonBlock value={template.loreAndCampaignHooks} />
      </Section>

      <Section title="Level-Up Path">
        <JsonBlock value={template.levelingPlan} />
      </Section>

      <Card id="finalize">
        <CardHeader>
          <CardTitle>Finalize This Character</CardTitle>
          <p className="mt-1 text-sm text-zinc-500">
            The template remains unchanged. This creates your own playable copy with runtime HP, inventory, spells, features, and attacks initialized.
          </p>
        </CardHeader>
        <form action={finalize} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Character name" name="character_name" required placeholder="Name your hero" />
            <Input label="Player name" name="player_name" placeholder="Your table name" />
            <Input label="Pronouns" name="pronouns" placeholder="Optional" />
            <Input label="Appearance" name="appearance" placeholder="Look, token, vibe" />
          </div>
          <Textarea label="Personality adjustments" name="personality_notes" rows={3} />
          <Textarea label="Backstory additions" name="backstory_additions" rows={3} />
          <Textarea label="Personal goal adjustments" name="personal_goal_adjustments" rows={2} />
          <Textarea label="Equipment notes" name="equipment_notes" rows={2} />
          {spellcasting && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <h3 className="text-sm font-semibold text-zinc-100">Prepared Spells</h3>
              {spellcasting.preparedSpellsRule && (
                <p className="mt-1 text-xs text-zinc-500">{spellcasting.preparedSpellsRule}</p>
              )}
              {spellOptions.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {spellOptions.map((spell) => (
                    <label key={spell} className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
                      <input type="checkbox" name="prepared_spells" value={spell} className="accent-amber-500" />
                      {spell}
                    </label>
                  ))}
                </div>
              )}
              <Textarea
                className="mt-3"
                label="Other prepared spells"
                name="prepared_spells_text"
                rows={2}
                placeholder="For clerics or DM-approved choices, separate with commas or lines."
              />
            </div>
          )}
          <Textarea label="Campaign-specific notes" name="campaign_notes" rows={3} />
          <Textarea label="Custom notes" name="custom_notes" rows={3} />
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-sm text-amber-100">
              Ability scores, AC, HP maximum, attack bonuses, class features, race traits, and starting equipment are cloned from the protected template. Changing those later should be treated as DM-reviewed.
            </p>
          </div>
          <Button type="submit" className="self-start">Save Finalized Character</Button>
        </form>
      </Card>
    </div>
  )
}
