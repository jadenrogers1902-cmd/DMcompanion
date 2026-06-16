import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'
import { CampaignCard } from '@/components/campaigns/CampaignCard'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Campaign, CampaignWithRole } from '@/lib/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Step 1: get all memberships for this user
  const { data: memberships } = await supabase
    .from('campaign_members')
    .select('campaign_id, role')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  const campaignIds = (memberships ?? []).map((m) => m.campaign_id)

  let campaigns: CampaignWithRole[] = []

  if (campaignIds.length > 0) {
    // Step 2: fetch campaign details
    const { data: campaignRows } = await supabase
      .from('campaigns')
      .select('*')
      .in('id', campaignIds)

    // Step 3: get member counts
    const { data: memberCounts } = await supabase
      .from('campaign_members')
      .select('campaign_id')
      .in('campaign_id', campaignIds)

    const countMap: Record<string, number> = {}
    memberCounts?.forEach((m) => {
      countMap[m.campaign_id] = (countMap[m.campaign_id] ?? 0) + 1
    })

    const roleMap: Record<string, string> = {}
    memberships?.forEach((m) => {
      roleMap[m.campaign_id] = m.role
    })

    campaigns = (campaignRows ?? []).map((c: Campaign) => ({
      ...c,
      member_role: (roleMap[c.id] ?? 'player') as 'dm' | 'player',
      member_count: countMap[c.id] ?? 1,
    }))

    // Preserve order (newest membership first)
    campaigns.sort(
      (a, b) => campaignIds.indexOf(a.id) - campaignIds.indexOf(b.id),
    )
  }

  const dmCampaigns = campaigns.filter((c) => c.member_role === 'dm')
  const playerCampaigns = campaigns.filter((c) => c.member_role === 'player')

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Your Campaigns</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage your adventures</p>
        </div>
        <div className="flex gap-2">
          <Link href="/join">
            <Button variant="secondary" size="sm">
              Join
            </Button>
          </Link>
          <Link href="/campaigns/new">
            <Button size="sm">New Campaign</Button>
          </Link>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={
            <svg
              className="w-12 h-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              />
            </svg>
          }
          title="No campaigns yet"
          description="Create a campaign as Dungeon Master or join one with an invite code."
          action={
            <div className="flex gap-3">
              <Link href="/join">
                <Button variant="secondary">Join a campaign</Button>
              </Link>
              <Link href="/campaigns/new">
                <Button>Create campaign</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {dmCampaigns.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                Dungeon Master
              </h2>
              <div className="flex flex-col gap-3">
                {dmCampaigns.map((c) => (
                  <CampaignCard key={c.id} campaign={c} />
                ))}
              </div>
            </section>
          )}

          {playerCampaigns.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                Playing In
              </h2>
              <div className="flex flex-col gap-3">
                {playerCampaigns.map((c) => (
                  <CampaignCard key={c.id} campaign={c} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
