import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Encounter } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EncountersPage({ params }: PageProps) {
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

  const isDM = membership.role === 'dm'
  const { data } = await supabase
    .from('encounters')
    .select('*')
    .eq('campaign_id', id)
    .order('updated_at', { ascending: false })

  const encounters = (data ?? []) as Encounter[]

  return (
    <div className={isDM ? 'mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8' : 'max-w-4xl mx-auto px-4 sm:px-6 py-8'}>
      <Link
        href={`/campaigns/${id}`}
        className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {campaign.name}
      </Link>

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-zinc-100">Encounters</h1>
            <Badge variant={isDM ? 'dm' : 'player'}>{isDM ? 'DM' : 'Player'}</Badge>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Track initiative, HP, conditions, and turn order.
          </p>
        </div>
        {isDM && (
          <Link href={`/campaigns/${id}/encounters/new`}>
            <Button size="sm">New Encounter</Button>
          </Link>
        )}
      </div>

      {encounters.length === 0 ? (
        <EmptyState
          title={isDM ? 'No encounters yet' : 'No encounters shared yet'}
          description={
            isDM
              ? 'Create an encounter when combat starts or while preparing a session.'
              : 'Your DM has not created an encounter for this campaign yet.'
          }
          action={
            isDM ? (
              <Link href={`/campaigns/${id}/encounters/new`}>
                <Button>Create encounter</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {encounters.map((encounter) => (
            <Link
              key={encounter.id}
              href={`/campaigns/${id}/encounters/${encounter.id}`}
            >
              <div className="h-full rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-zinc-100">{encounter.name}</h2>
                  <Badge
                    variant={
                      encounter.status === 'active'
                        ? 'success'
                        : encounter.status === 'completed'
                          ? 'default'
                          : 'warning'
                    }
                  >
                    {encounter.status}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  Round {encounter.current_round}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
