import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CharacterSheet } from '@/components/characters/CharacterSheet'
import type {
  Ability,
  Character,
  Condition,
  InventoryItem,
  Spell,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string; charId: string }>
}

export default async function CharacterDetailPage({ params }: PageProps) {
  const { id, charId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Membership + role
  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', id)
    .eq('user_id', user.id)
    .single()
  if (!membership) redirect('/dashboard')
  const isDM = membership.role === 'dm'

  // Character (RLS ensures only campaign members can read)
  const { data: character } = await supabase
    .from('characters')
    .select('*')
    .eq('id', charId)
    .eq('campaign_id', id)
    .single<Character>()

  if (!character) notFound()

  const isOwner = character.user_id === user.id

  // Child records — RLS filters what this user is allowed to see
  // (e.g. inventory items hidden from the DM won't be returned).
  const [{ data: inventory }, { data: spells }, { data: abilities }, { data: conditions }] =
    await Promise.all([
      supabase
        .from('character_inventory_items')
        .select('*')
        .eq('character_id', charId)
        .order('created_at', { ascending: true }),
      supabase
        .from('character_spells')
        .select('*')
        .eq('character_id', charId)
        .order('spell_level', { ascending: true }),
      supabase
        .from('character_abilities')
        .select('*')
        .eq('character_id', charId)
        .order('created_at', { ascending: true }),
      supabase
        .from('character_conditions')
        .select('*')
        .eq('character_id', charId)
        .order('created_at', { ascending: true }),
    ])

  // Owner display name (for DM context)
  let ownerName: string | undefined
  if (!isOwner) {
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', character.user_id)
      .single()
    ownerName = ownerProfile?.display_name
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href={`/campaigns/${id}/characters`}
        className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {isDM ? 'Party Dashboard' : 'Characters'}
      </Link>

      <CharacterSheet
        campaignId={id}
        character={character}
        inventory={(inventory ?? []) as InventoryItem[]}
        spells={(spells ?? []) as Spell[]}
        abilities={(abilities ?? []) as Ability[]}
        conditions={(conditions ?? []) as Condition[]}
        isOwner={isOwner}
        isDM={isDM}
        ownerName={ownerName}
      />
    </div>
  )
}
