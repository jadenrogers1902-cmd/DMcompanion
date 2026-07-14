import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  Activity,
  Backpack,
  BookOpenText,
  ChevronDown,
  Coins,
  Crosshair,
  Gauge,
  Languages,
  ListChecks,
  MapPinned,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Swords,
  TrendingUp,
  UserRound,
  WandSparkles,
} from 'lucide-react'
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
  icon,
  children,
  open = false,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  open?: boolean
}) {
  return (
    <details open={open} className="group rounded-xl border border-border bg-shell">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-content">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent" aria-hidden="true">
            {icon}
          </span>
          {title}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-faint transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function scalarText(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not provided'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function StructuredData({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (!Array.isArray(value) && !isRecord(value)) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{scalarText(value)}</p>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-sm text-faint">None listed.</p>
    const scalarItems = value.every((item) => !Array.isArray(item) && !isRecord(item))
    if (scalarItems) {
      return (
        <ul className="grid gap-2 sm:grid-cols-2">
          {value.map((item, index) => (
            <li key={`${scalarText(item)}-${index}`} className="flex min-h-10 items-start gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-muted">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <span className="whitespace-pre-wrap">{scalarText(item)}</span>
            </li>
          ))}
        </ul>
      )
    }

    return (
      <div className="grid gap-3">
        {value.map((item, index) => (
          <div key={index} className="rounded-lg border border-border bg-canvas p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">Entry {index + 1}</p>
            <StructuredData value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }

  const entries = Object.entries(value)
  if (entries.length === 0) return <p className="text-sm text-faint">None listed.</p>

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, item]) => {
        const nested = Array.isArray(item) || isRecord(item)
        return (
          <div
            key={key}
            className={`rounded-lg border border-border p-3 ${nested ? 'sm:col-span-2' : ''} ${depth > 0 ? 'bg-panel/70' : 'bg-canvas'}`}
          >
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-faint">{humanizeKey(key)}</dt>
            <dd className="mt-1.5">
              {nested ? <StructuredData value={item} depth={depth + 1} /> : <span className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{scalarText(item)}</span>}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function DataGroup({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-content">
        <span className="text-accent" aria-hidden="true">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
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
        <div key={label} className="rounded-lg border border-border bg-panel p-3">
          <p className="text-lg font-bold text-content">{value}</p>
          <p className="text-[10px] uppercase tracking-wider text-faint">{label}</p>
        </div>
      ))}
    </div>
  )
}

function SpellcastingSummary({ spellcasting }: { spellcasting: TemplateSpellcasting | null }) {
  if (!spellcasting) return <p className="text-sm text-faint">This template is not a spellcaster.</p>
  const { ability, spellSaveDC, spellAttackBonus, ...details } = spellcasting
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-panel p-3">
          <p className="text-sm font-semibold text-content">{ability}</p>
          <p className="text-xs text-faint">Spellcasting ability</p>
        </div>
        <div className="rounded-lg border border-border bg-panel p-3">
          <p className="text-sm font-semibold text-content">{spellSaveDC}</p>
          <p className="text-xs text-faint">Save DC</p>
        </div>
        <div className="rounded-lg border border-border bg-panel p-3">
          <p className="text-sm font-semibold text-content">+{spellAttackBonus}</p>
          <p className="text-xs text-faint">Spell attack</p>
        </div>
      </div>
      <StructuredData value={details} />
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
                <h2 className="text-lg font-semibold text-content">{summary.name}</h2>
                <p className="mt-1 text-sm text-faint">
                  {summary.race} · {summary.className} {summary.level} · {summary.background}
                </p>
              </div>
              <Badge variant={summary.spellcaster ? 'success' : 'default'}>
                {summary.spellcaster ? 'Caster' : 'Martial'}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed text-muted">{summary.role}</p>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-shell p-3">
                <dt className="text-xs text-faint">Alignment</dt>
                <dd className="text-content">{summary.alignment}</dd>
              </div>
              <div className="rounded-lg bg-shell p-3">
                <dt className="text-xs text-faint">Combat style</dt>
                <dd className="text-content">{summary.combatStyle}</dd>
              </div>
              <div className="rounded-lg bg-shell p-3 sm:col-span-2">
                <dt className="text-xs text-faint">Spellcasting</dt>
                <dd className="text-content">{summary.magicType}</dd>
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
              <h1 className="text-2xl font-bold text-content">{template.templateName}</h1>
              <Badge variant={spellcasting ? 'success' : 'default'}>
                {spellcasting ? 'Spellcaster' : 'Starter'}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-faint">
              {template.identity.race} · {template.identity.class} {template.identity.level} · {template.identity.background} · {template.identity.alignment}
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">{template.playstyleSummary}</p>
          </div>
          <Link href={`/campaigns/${campaignId}/characters/templates#${template.id}`}>
            <Button type="button" variant="secondary" size="sm">Back to templates</Button>
          </Link>
        </div>
      </Card>

      <Section title="Overview" icon={<UserRound className="h-4 w-4" />} open>
        <div className="flex flex-col gap-4">
          <StatGrid template={template} />
          <div className="flex flex-wrap gap-2">
            {(template.roleTags ?? []).map((tag) => (
              <span key={tag} className="rounded-full bg-panel-raised px-2.5 py-1 text-xs text-muted">
                {tag}
              </span>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <DataGroup title="Identity" icon={<UserRound className="h-4 w-4" />}>
              <StructuredData value={template.identity} />
            </DataGroup>
            <DataGroup title="Template details" icon={<ScrollText className="h-4 w-4" />}>
              <StructuredData
                value={{
                  id: template.id,
                  templateName: template.templateName,
                  templateStatus: template.templateStatus,
                  sourcePages: template.sourcePages,
                  roleTags: template.roleTags,
                  playstyleSummary: template.playstyleSummary,
                }}
              />
            </DataGroup>
          </div>
        </div>
      </Section>

      <Section title="Core Stats" icon={<Gauge className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <DataGroup title="Ability scores" icon={<Activity className="h-4 w-4" />}>
            <StructuredData value={template.abilityScores} />
          </DataGroup>
          <DataGroup title="Vitals and combat stats" icon={<Gauge className="h-4 w-4" />}>
            <StructuredData value={template.coreStats} />
          </DataGroup>
        </div>
      </Section>

      <Section title="Skills" icon={<ListChecks className="h-4 w-4" />}>
        <StructuredData value={template.skills} />
      </Section>

      <Section title="Saving Throws" icon={<ShieldCheck className="h-4 w-4" />}>
        <StructuredData value={template.savingThrows} />
      </Section>

      <Section title="Combat" icon={<Swords className="h-4 w-4" />}>
        <DataGroup title="Attacks" icon={<Crosshair className="h-4 w-4" />}>
          <StructuredData value={template.attacksAndSpellcasting.attacks} />
        </DataGroup>
      </Section>

      <Section title="Spellcasting" icon={<WandSparkles className="h-4 w-4" />}>
        <SpellcastingSummary spellcasting={spellcasting} />
      </Section>

      <Section title="Features And Traits" icon={<Sparkles className="h-4 w-4" />}>
        <div className="flex flex-col gap-3">
          {template.featuresAndTraits.map((feature) => (
            <div key={`${feature.source}-${feature.name}`} className="rounded-lg border border-border bg-panel p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-content">{feature.name}</h3>
                <span className="text-xs text-faint">{feature.source}</span>
                {feature.actionType && <Badge variant="default">{feature.actionType}</Badge>}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.description}</p>
              {feature.uses && <p className="mt-2 text-xs text-accent">{feature.uses}</p>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Equipment" icon={<Backpack className="h-4 w-4" />}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <DataGroup title="Starting equipment" icon={<Backpack className="h-4 w-4" />}>
            <StructuredData value={template.equipment} />
          </DataGroup>
          <DataGroup title="Currency" icon={<Coins className="h-4 w-4" />}>
            <StructuredData value={template.currency} />
          </DataGroup>
        </div>
      </Section>

      <Section title="Proficiencies And Languages" icon={<Languages className="h-4 w-4" />}>
        <StructuredData value={template.proficienciesAndLanguages} />
      </Section>

      <Section title="Personality" icon={<BookOpenText className="h-4 w-4" />}>
        <StructuredData value={template.personality} />
      </Section>

      <Section title="Backstory And Personal Goal" icon={<MapPinned className="h-4 w-4" />}>
        <StructuredData value={template.loreAndCampaignHooks} />
      </Section>

      <Section title="Level-Up Path" icon={<TrendingUp className="h-4 w-4" />}>
        <StructuredData value={template.levelingPlan} />
      </Section>

      <Section title="Customization Guide" icon={<SlidersHorizontal className="h-4 w-4" />}>
        <StructuredData value={template.customization} />
      </Section>

      <Card id="finalize">
        <CardHeader>
          <CardTitle>Finalize This Character</CardTitle>
          <p className="mt-1 text-sm text-faint">
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
            <div className="rounded-lg border border-border bg-shell p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-content">
                <WandSparkles className="h-4 w-4 text-accent" aria-hidden="true" />
                Prepared Spells
              </h3>
              {spellcasting.preparedSpellsRule && (
                <p className="mt-1 text-xs text-faint">{spellcasting.preparedSpellsRule}</p>
              )}
              {spellOptions.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {spellOptions.map((spell) => (
                    <label key={spell} className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-panel px-3 py-2 text-sm text-muted">
                      <input type="checkbox" name="prepared_spells" value={spell} className="accent-accent" />
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
          <div className="rounded-lg border border-accent/30 bg-accent/10 p-3">
            <p className="text-sm text-accent">
              Ability scores, AC, HP maximum, attack bonuses, class features, race traits, and starting equipment are cloned from the protected template. Changing those later should be treated as DM-reviewed.
            </p>
          </div>
          <Button type="submit" className="self-start">Save Finalized Character</Button>
        </form>
      </Card>
    </div>
  )
}
