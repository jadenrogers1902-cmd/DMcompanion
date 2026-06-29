import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { DMCharacterDashboard } from '@/components/characters/DMCharacterDashboard'
import { hpColor } from '@/lib/utils/character'
import type {
  Character,
  CharacterWithOwner,
  Condition,
  Profile,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

function CharacterMiniCard({
  campaignId,
  character,
  editable,
}: {
  campaignId: string
  character: Character
  editable: boolean
}) {
  return (
    <Link href={`/campaigns/${campaignId}/characters/${character.id}`}>
      <Card className="h-full transition-colors hover:border-zinc-600" padding="sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-zinc-100">{character.name}</p>
            <CardDescription className="mt-0.5">
              {[character.race, character.class && `${character.class} ${character.level}`]
                .filter(Boolean)
                .join(' - ') || `Level ${character.level}`}
            </CardDescription>
          </div>
          <div className="shrink-0 text-right">
            <span className={`font-bold ${hpColor(character.current_hp, character.max_hp)}`}>
              {character.current_hp}
            </span>
            <span className="text-sm text-zinc-600">/{character.max_hp}</span>
            <p className="text-xs text-zinc-600">AC {character.armor_class}</p>
          </div>
        </div>
        {editable && (
          <span className="mt-3 inline-block text-xs text-amber-400">Edit -&gt;</span>
        )}
      </Card>
    </Link>
  )
}

export default async function CharactersPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('id', id)
    .single()
  if (!campaign) notFound()

  const { data: myMembership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', id)
    .eq('user_id', user.id)
    .single()
  if (!myMembership) redirect('/dashboard')

  const isDM = myMembership.role === 'dm'

  const { data: charsRaw } = await supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', id)
    .order('name', { ascending: true })

  const characters = (charsRaw ?? []) as Character[]

  const backLink = (
    <Link
      href={`/campaigns/${id}`}
      className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      {campaign.name}
    </Link>
  )

  if (isDM) {
    const userIds = [...new Set(characters.map((character) => character.user_id))]
    const charIds = characters.map((character) => character.id)

    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('*').in('id', userIds)
      : { data: [] as Profile[] }

    const { data: conditions } = charIds.length
      ? await supabase.from('character_conditions').select('*').in('character_id', charIds)
      : { data: [] as Condition[] }

    const profileMap: Record<string, Profile> = {}
    ;(profiles ?? []).forEach((profile) => {
      profileMap[profile.id] = profile
    })

    const conditionMap: Record<string, Condition[]> = {}
    ;(conditions ?? []).forEach((condition) => {
      ;(conditionMap[condition.character_id] ??= []).push(condition)
    })

    const dashboardChars: CharacterWithOwner[] = characters.map((character) => ({
      ...character,
      profiles: profileMap[character.user_id] ?? null,
      character_conditions: conditionMap[character.id] ?? [],
    }))

    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-8">
          {backLink}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-zinc-100">Party Dashboard</h1>
                <Badge variant="dm">DM</Badge>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Quick glance at every character in the campaign.
              </p>
            </div>
          </div>
        </div>

        {dashboardChars.length === 0 ? (
          <EmptyState
            title="No characters yet"
            description="Players will appear here once they create characters in this campaign."
          />
        ) : (
          <DMCharacterDashboard campaignId={id} characters={dashboardChars} />
        )}
      </div>
    )
  }

  const myChars = characters.filter((character) => character.user_id === user.id)
  const partyChars = characters.filter((character) => character.user_id !== user.id)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        {backLink}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Characters</h1>
            <p className="mt-1 text-sm text-zinc-500">Manage your characters in this campaign.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/campaigns/${id}/characters/templates`}>
              <Button size="sm">Starter Templates</Button>
            </Link>
            <Link href={`/campaigns/${id}/characters/new`}>
              <Button size="sm" variant="secondary">Manual Create</Button>
            </Link>
          </div>
        </div>
      </div>

      {myChars.length === 0 ? (
        <EmptyState
          icon={(
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          )}
          title="No characters yet"
          description="Choose a starter template or create a blank character to start tracking HP, stats, inventory, and more."
          action={(
            <Link href={`/campaigns/${id}/characters/templates`}>
              <Button>Choose starter template</Button>
            </Link>
          )}
        />
      ) : (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Your Characters
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {myChars.map((character) => (
              <CharacterMiniCard key={character.id} campaignId={id} character={character} editable />
            ))}
          </div>
        </section>
      )}

      {partyChars.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Party
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {partyChars.map((character) => (
              <CharacterMiniCard key={character.id} campaignId={id} character={character} editable={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
