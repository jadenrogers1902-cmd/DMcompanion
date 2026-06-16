import { notFound, redirect } from 'next/navigation'
import { CodexSchemaView } from '@/components/codex/CodexSchemaView'
import { createClient } from '@/lib/supabase/server'
import type { CampaignDoc, CampaignDocLink, NotionSyncMapping } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ table?: string }>
}

export default async function CodexSchemaPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { table } = await searchParams
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

  const [{ data: docs }, { data: links }, { data: mappings }] = await Promise.all([
    supabase.from('campaign_docs').select('*').eq('campaign_id', id).order('title', { ascending: true }),
    supabase.from('campaign_doc_links').select('*').eq('campaign_id', id),
    supabase.from('notion_sync_mappings').select('*').eq('campaign_id', id).order('updated_at', { ascending: false }),
  ])

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-5 sm:px-6 lg:px-8">
      <CodexSchemaView
        campaignId={id}
        docs={(docs ?? []) as CampaignDoc[]}
        links={(links ?? []) as CampaignDocLink[]}
        mappings={(mappings ?? []) as NotionSyncMapping[]}
        initialTable={table}
      />
    </div>
  )
}
