import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CharacterForm } from '@/components/characters/CharacterForm'
import type { Character } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string; charId: string }>
}

export default async function EditCharacterPage({ params }: PageProps) {
  const { id, charId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: character } = await supabase
    .from('characters')
    .select('*')
    .eq('id', charId)
    .eq('campaign_id', id)
    .single<Character>()

  if (!character) notFound()

  // Only the owner may edit the full sheet
  if (character.user_id !== user.id) {
    redirect(`/campaigns/${id}/characters/${charId}`)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <Link
          href={`/campaigns/${id}/characters/${charId}`}
          className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to {character.name}
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100">Edit Character</h1>
      </div>

      <CharacterForm campaignId={id} character={character} />
    </div>
  )
}
