import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCharacterTemplate } from '@/lib/character-templates'
import { CharacterTemplateDetail } from '@/components/characters/CharacterTemplateBrowser'

interface PageProps {
  params: Promise<{ id: string; templateId: string }>
}

export default async function CharacterTemplateDetailPage({ params }: PageProps) {
  const { id, templateId } = await params
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

  const template = getCharacterTemplate(templateId)
  if (!template) notFound()

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <Link
          href={`/campaigns/${id}/characters/templates`}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Starter templates
        </Link>
      </div>

      <CharacterTemplateDetail campaignId={id} template={template} />
    </div>
  )
}
