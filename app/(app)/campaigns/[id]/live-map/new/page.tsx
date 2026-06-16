import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MapUploader } from '@/components/maps/MapUploader'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function NewMapPage({ params }: PageProps) {
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

  // DM only
  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', id)
    .eq('user_id', user.id)
    .single()
  if (!membership || membership.role !== 'dm') {
    redirect(`/campaigns/${id}/live-map`)
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <Link
          href={`/campaigns/${id}/live-map`}
          className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Live Map
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100">Upload Map</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Upload a battle map image. You can configure the grid and add tokens next.
        </p>
      </div>

      <MapUploader campaignId={id} />
    </div>
  )
}
