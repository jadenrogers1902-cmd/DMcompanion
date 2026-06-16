import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { NotionMappingManager } from '@/components/codex/NotionMappingManager'
import { NotionTableDiscovery } from '@/components/codex/NotionTableDiscovery'
import { createClient } from '@/lib/supabase/server'
import { cleanupOrphanedNotionReferences, getNotionMappings } from '@/lib/actions/notion-mappings'
import { getNotionConnectionStatus } from '@/lib/actions/notion-settings'
import type { Adventure } from '@/lib/types/adventure'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function NotionMappingPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: campaign }, { data: membership }] = await Promise.all([
    supabase.from('campaigns').select('id, name').eq('id', id).single(),
    supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', id)
      .eq('user_id', user.id)
      .single(),
  ])

  if (!campaign) notFound()
  if (!membership) redirect('/dashboard')
  // DM-only configuration surface.
  if (membership.role !== 'dm') redirect(`/campaigns/${id}/codex`)

  const cleanup = await cleanupOrphanedNotionReferences(id)

  const [mappings, status, { data: adventuresRaw }] = await Promise.all([
    getNotionMappings(id),
    getNotionConnectionStatus(id),
    supabase.from('adventures').select('id, title, status').eq('campaign_id', id).order('created_at', { ascending: true }),
  ])
  const adventures = (adventuresRaw ?? []) as Pick<Adventure, 'id' | 'title' | 'status'>[]
  const connected = status.serverReady && status.configured && status.enabled

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-5 sm:px-6 lg:px-8">
      <Link
        href={`/campaigns/${id}/codex`}
        className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Adventure Codex
      </Link>
      <div className="flex flex-col gap-5">
        <NotionTableDiscovery campaignId={id} adventures={adventures} serverReady={connected} />
        <NotionMappingManager
          campaignId={id}
          mappings={mappings}
          serverReady={connected}
          initialNotice={cleanup.message ?? null}
        />
      </div>
    </div>
  )
}
