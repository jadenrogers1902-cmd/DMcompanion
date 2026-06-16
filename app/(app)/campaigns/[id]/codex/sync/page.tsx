import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { NotionSyncDashboard } from '@/components/codex/NotionSyncDashboard'
import { createClient } from '@/lib/supabase/server'
import { getNotionConnectionStatus } from '@/lib/actions/notion-settings'
import type {
  CampaignDoc,
  CampaignDocLink,
  NotionSyncLog,
  NotionSyncMapping,
} from '@/lib/types/database'
import type { Adventure } from '@/lib/types/adventure'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function NotionSyncDashboardPage({ params }: PageProps) {
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
  if (membership.role !== 'dm') redirect(`/campaigns/${id}/codex`)

  const [{ data: docs }, { data: links }, { data: mappings }, { data: logs }, { data: adventures }, status] =
    await Promise.all([
      supabase
        .from('campaign_docs')
        .select('*')
        .eq('campaign_id', id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('campaign_doc_links')
        .select('*')
        .eq('campaign_id', id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('notion_sync_mappings')
        .select('*')
        .eq('campaign_id', id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('notion_sync_logs')
        .select('*')
        .eq('campaign_id', id)
        .order('started_at', { ascending: false })
        .limit(50),
      supabase
        .from('adventures')
        .select('id, title, status')
        .eq('campaign_id', id)
        .order('created_at', { ascending: true }),
      getNotionConnectionStatus(id),
    ])

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      <Link
        href={`/campaigns/${id}/codex`}
        className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Adventure Codex
      </Link>
      <NotionSyncDashboard
        campaignId={id}
        docs={(docs ?? []) as CampaignDoc[]}
        links={(links ?? []) as CampaignDocLink[]}
        mappings={(mappings ?? []) as NotionSyncMapping[]}
        logs={(logs ?? []) as NotionSyncLog[]}
        adventures={(adventures ?? []) as Pick<Adventure, 'id' | 'title' | 'status'>[]}
        serverReady={status.serverReady}
        connected={status.serverReady && status.configured && status.enabled}
      />
    </div>
  )
}
