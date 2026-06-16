import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCharacterTemplates } from '@/lib/character-templates'
import { CharacterTemplateCards } from '@/components/characters/CharacterTemplateBrowser'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CharacterTemplatesPage({ params }: PageProps) {
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

  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', id)
    .eq('user_id', user.id)
    .single()
  if (!membership) redirect('/dashboard')

  const templates = getCharacterTemplates()

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <Link
          href={`/campaigns/${id}/characters`}
          className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to characters
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100">Starter Character Templates</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">
          Choose a Starter Set profile, review the full sheet detail, then save your own finalized copy for {campaign.name}.
        </p>
      </div>

      <CharacterTemplateCards campaignId={id} templates={templates} />
    </div>
  )
}
