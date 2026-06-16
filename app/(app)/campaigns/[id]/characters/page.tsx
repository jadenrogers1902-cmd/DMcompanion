import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
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
    <Link
      href={`/campaigns/${campaignId}/characters/${character.id}`}
      className="block p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-100">{character.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {[character.race, character.class && `${character.class} ${character.level}`]
              .filter(Boolean)
              .join(' · ') || `Level ${character.level}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className={`font-bold ${hpColor(character.current_hp, character.max_hp)}`}>
            {character.current_hp}
          </span>
          <span className="text-sm text-zinc-600">/{character.max_hp}</span>
          <p className="text-xs text-zinc-600">AC {character.armor_class}</p>
        </div>
      </div>
      {editable && (
        <span className="inline-block mt-3 text-xs text-amber-400">Edit →</span>
      )}
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

  // Fetch all characters in the campaign (RLS allows members to read)
  const { data: charsRaw } = await supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', id)
    .order('name', { ascending: true })

  const characters = (charsRaw ?? []) as Character[]

  const backLink = (
    <Link
      href={`/campaigns/${id}`}
      className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      {campaign.name}
    </Link>
  )

  // ─── DM VIEW: quick-glance dashboard of all characters ───
  if (isDM) {
    const userIds = [...new Set(characters.map((c) => c.user_id))]
    const charIds = characters.map((c) => c.id)

    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('*').in('id', userIds)
      : { data: [] as Profile[] }

    const { data: conditions } = charIds.length
      ? await supabase.from('character_conditions').select('*').in('character_id', charIds)
      : { data: [] as Condition[] }

    const profileMap: Record<string, Profile> = {}
    ;(profiles ?? []).forEach((p) => (profileMap[p.id] = p))

    const condMap: Record<string, Condition[]> = {}
    ;(conditions ?? []).forEach((c) => {
      ;(condMap[c.character_id] ??= []).push(c)
    })

    const dashboardChars: CharacterWithOwner[] = characters.map((c) => ({
      ...c,
      profiles: profileMap[c.user_id] ?? null,
      character_conditions: condMap[c.id] ?? [],
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
              <p className="text-sm text-zinc-500 mt-1">
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

  // ─── PLAYER VIEW: own characters + party roster ───
  const myChars = characters.filter((c) => c.user_id === user.id)
  const partyChars = characters.filter((c) => c.user_id !== user.id)

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        {backLink}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Characters</h1>
            <p className="text-sm text-zinc-500 mt-1">Manage your characters in this campaign.</p>
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
          icon={
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          }
          title="No characters yet"
          description="Choose a starter template or create a blank character to start tracking HP, stats, inventory, and more."
          action={
            <Link href={`/campaigns/${id}/characters/templates`}>
              <Button>Choose starter template</Button>
            </Link>
          }
        />
      ) : (
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Your Characters
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {myChars.map((c) => (
              <CharacterMiniCard key={c.id} campaignId={id} character={c} editable />
            ))}
          </div>
        </section>
      )}

      {partyChars.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Party
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {partyChars.map((c) => (
              <CharacterMiniCard key={c.id} campaignId={id} character={c} editable={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
