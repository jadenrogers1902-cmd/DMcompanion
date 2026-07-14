import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { BookMarked, NotebookTabs, Swords, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { MemberList } from '@/components/campaigns/MemberList'
import { InviteCode } from '@/components/campaigns/InviteCode'
import { PlayerDestinationCard } from '@/components/campaigns/PlayerDestinationCard'
import { PlayerTabletopCard } from '@/components/campaigns/PlayerTabletopCard'
import { DMUtilityPanel } from '@/components/nav/DMUtilityPanel'
import type { CampaignMemberWithProfile } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = {
  title: 'Campaign Home',
}

// Active navigation card (links to a built feature)
function FeatureCard({
  href,
  title,
  description,
}: {
  href: string
  title: string
  description: string
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-border-strong hover:bg-hover/50 transition-all cursor-pointer h-full">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-medium text-content">{title}</h3>
          <svg className="w-4 h-4 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
        <p className="text-xs text-faint">{description}</p>
      </Card>
    </Link>
  )
}

function SessionMetric({
  label,
  value,
  href,
  tone = 'default',
}: {
  label: string
  value: string
  href: string
  tone?: 'default' | 'warning'
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border p-4 transition hover:border-border-strong ${
        tone === 'warning'
          ? 'border-accent/60 bg-accent/20'
          : 'border-border bg-panel'
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-2 truncate text-lg font-semibold text-content">{value}</p>
    </Link>
  )
}

export default async function CampaignPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (!campaign) notFound()

  // Get current user's membership
  const { data: myMembership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', id)
    .eq('user_id', user.id)
    .single()

  if (!myMembership) redirect('/dashboard')

  const isDM = myMembership.role === 'dm'

  // Fetch members with profiles
  const { data: membersRaw } = await supabase
    .from('campaign_members')
    .select(`
      id, campaign_id, user_id, role, joined_at,
      profiles ( id, display_name, avatar_url, created_at )
    `)
    .eq('campaign_id', id)
    .order('joined_at', { ascending: true })

  const members = (membersRaw ?? []) as unknown as CampaignMemberWithProfile[]

  let activeMap: { id: string; name: string } | null = null
  let pendingCount = 0
  let charactersCount = 0

  if (isDM) {
    const [{ data: activeMapRaw }, { data: pendingRequests }, { data: characters }] =
      await Promise.all([
        supabase
          .from('maps')
          .select('id, name')
          .eq('campaign_id', id)
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('action_intents')
          .select('id')
          .eq('campaign_id', id)
          .in('status', ['pending', 'needs_roll', 'approved', 'resolving']),
        supabase
          .from('characters')
          .select('id')
          .eq('campaign_id', id),
      ])

    activeMap = activeMapRaw
    pendingCount = pendingRequests?.length ?? 0
    charactersCount = characters?.length ?? 0
  }

  return (
    <div className={isDM ? 'mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8' : 'max-w-3xl mx-auto px-4 sm:px-6 py-8'}>
      {/* Header */}
      <div className={isDM ? 'mb-5' : 'mb-8'}>
        <Link
          href="/dashboard"
          className="text-sm text-faint hover:text-content flex items-center gap-1.5 mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          All campaigns
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-2xl font-bold text-content">{campaign.name}</h1>
              <Badge variant={isDM ? 'dm' : 'player'}>
                {isDM ? 'DM' : 'Player'}
              </Badge>
            </div>
            {campaign.description && (
              <p className="text-sm text-faint max-w-xl">{campaign.description}</p>
            )}
          </div>
          {isDM && (
            <Link href={`/campaigns/${id}/settings`}>
              <Button variant="secondary" size="sm">
                Settings
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* DM Layout */}
      {isDM ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SessionMetric label="Active map" value={activeMap?.name ?? 'None'} href={`/campaigns/${id}/live-map`} />
              <SessionMetric label="Open requests" value={String(pendingCount)} href={`/campaigns/${id}/actions`} tone={pendingCount > 0 ? 'warning' : 'default'} />
              <SessionMetric label="Players" value={String(Math.max(0, members.length - 1))} href={`/campaigns/${id}/settings`} />
              <SessionMetric label="Characters" value={String(charactersCount)} href={`/campaigns/${id}/characters`} />
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <Card>
                <CardHeader>
                  <CardTitle>Session Control</CardTitle>
                </CardHeader>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <FeatureCard
                    href={`/campaigns/${id}/live-map`}
                    title="Go to Live Map"
                    description="Open the live session map: active scene, tokens, and reveal tools."
                  />
                  <FeatureCard
                    href={`/campaigns/${id}/adventures`}
                    title="Adventure Maker"
                    description="Prep adventures, chapters, and maps before the session."
                  />
                  <FeatureCard
                    href={`/campaigns/${id}/actions`}
                    title="Requests"
                    description="Resolve player intents without losing the table flow."
                  />
                  <FeatureCard
                    href={`/campaigns/${id}/encounters`}
                    title="Encounters"
                    description="Run initiative, HP, conditions, and rounds."
                  />
                  <FeatureCard
                    href={`/campaigns/${id}/characters`}
                    title="Player Stats"
                    description="Scan HP, AC, conditions, and character sheets."
                  />
                  <FeatureCard
                    href={`/campaigns/${id}/story`}
                    title="Story Tools"
                    description="Open quests, NPCs, notes, handouts, and recaps."
                  />
                  <FeatureCard
                    href={`/campaigns/${id}/export`}
                    title="Export Backup"
                    description="Download campaign data and metadata as JSON."
                  />
                </div>
              </Card>

              <div className="grid gap-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Invite Code</CardTitle>
                  </CardHeader>
                  <InviteCode campaignId={campaign.id} initialCode={campaign.invite_code} />
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Members</CardTitle>
                      <span className="text-sm text-faint">{members.length}</span>
                    </div>
                  </CardHeader>
                  <MemberList members={members} currentUserId={user.id} />
                </Card>
              </div>
            </div>
          </div>
          <DMUtilityPanel
            campaignId={id}
            campaignName={campaign.name}
            activeMapName={activeMap?.name}
            pendingRequests={pendingCount}
            memberCount={members.length}
            characterCount={charactersCount}
          />
        </div>
      ) : (
        /* Player Layout */
        <div className="flex flex-col gap-6">
          {/* Visual shortcuts put the player's next action first. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PlayerTabletopCard campaignId={id} className="sm:col-span-2" />
            <PlayerDestinationCard
              href={`/campaigns/${id}/characters`}
              title="My Characters"
              description="Create or update your character sheet."
              imageSrc="/player-ui/destinations/characters.webp"
              icon={UserRound}
            />
            <PlayerDestinationCard
              href={`/campaigns/${id}/encounters`}
              title="Encounters"
              description="Check combat, initiative, and progress."
              imageSrc="/player-ui/destinations/encounters.webp"
              icon={Swords}
            />
            <PlayerDestinationCard
              href={`/campaigns/${id}/story`}
              title="Party Journal"
              description="Find quests, notes, handouts, and recaps."
              imageSrc="/player-ui/destinations/journal.webp"
              icon={NotebookTabs}
            />
            <PlayerDestinationCard
              href={`/campaigns/${id}/codex`}
              title="Revealed Info"
              description="Review lore and discoveries revealed to you."
              imageSrc="/player-ui/destinations/revealed-info.webp"
              icon={BookMarked}
            />
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Party</CardTitle>
                <span className="text-sm text-faint">{members.length} members</span>
              </div>
            </CardHeader>
            <MemberList members={members} currentUserId={user.id} />
          </Card>
        </div>
      )}
    </div>
  )
}
