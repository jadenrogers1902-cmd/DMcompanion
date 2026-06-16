import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CharacterForm } from '@/components/characters/CharacterForm'
import { Button } from '@/components/ui/Button'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function NewCharacterPage({ params }: PageProps) {
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

  // Must be a member to create a character here
  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', id)
    .eq('user_id', user.id)
    .single()
  if (!membership) redirect('/dashboard')

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <Link
          href={`/campaigns/${id}/characters`}
          className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to characters
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">New Character</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Fill in what you know, or start from a full Starter Set template.
            </p>
          </div>
          <Link href={`/campaigns/${id}/characters/templates`}>
            <Button type="button" size="sm" variant="secondary">Browse templates</Button>
          </Link>
        </div>
      </div>

      <CharacterForm campaignId={id} />
    </div>
  )
}

