'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { updateCampaign, removeMember } from '@/lib/actions/campaigns'
import { NotionSettingsCard } from '@/components/settings/NotionSettingsCard'
import type { Campaign, CampaignMemberWithProfile } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function CampaignSettingsPage({ params }: PageProps) {
  const router = useRouter()
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [members, setMembers] = useState<CampaignMemberWithProfile[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)

  useEffect(() => {
    params.then(({ id }) => setCampaignId(id))
  }, [params])

  useEffect(() => {
    if (!campaignId) return

    async function load() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCurrentUserId(user.id)

      const [{ data: c }, { data: membership }] = await Promise.all([
        supabase
          .from('campaigns')
          .select('*')
          .eq('id', campaignId!)
          .single(),
        supabase
          .from('campaign_members')
          .select('role')
          .eq('campaign_id', campaignId!)
          .eq('user_id', user.id)
          .single(),
      ])

      if (!c || membership?.role !== 'dm') {
        router.push(`/campaigns/${campaignId}`)
        return
      }
      setCampaign(c)

      const { data: m } = await supabase
        .from('campaign_members')
        .select(`
          id, campaign_id, user_id, role, joined_at,
          profiles ( id, display_name, avatar_url, created_at )
        `)
        .eq('campaign_id', campaignId!)
        .order('joined_at', { ascending: true })

      setMembers((m ?? []) as unknown as CampaignMemberWithProfile[])
      setLoading(false)
    }

    load()
  }, [campaignId, router])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!campaignId) return
    setSaveLoading(true)
    setSaveError(null)
    setSaveSuccess(false)

    const formData = new FormData(e.currentTarget)
    const result = await updateCampaign(campaignId, formData)

    if (result?.error) {
      setSaveError(result.error)
    } else {
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    }
    setSaveLoading(false)
  }

  async function handleRemove(memberId: string) {
    if (!campaignId) return
    setRemoveError(null)
    setRemovingMemberId(memberId)
    const result = await removeMember(campaignId, memberId)
    setRemovingMemberId(null)
    if (result?.error) {
      setRemoveError(result.error)
      return
    }
    setMembers((prev) => prev.filter((m) => m.id !== memberId))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!campaign) return null

  const nonDMMembers = members.filter((m) => m.role === 'player')

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <Link
          href={`/campaigns/${campaignId}`}
          className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to campaign
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100">Campaign Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Only visible to the Dungeon Master.</p>
      </div>

      {/* Campaign details */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
        </CardHeader>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {saveError && <Alert message={saveError} />}
          {saveSuccess && <Alert variant="success" message="Campaign updated." />}

          <Input
            label="Campaign name"
            name="name"
            defaultValue={campaign.name}
            required
          />
          <Textarea
            label="Description"
            name="description"
            defaultValue={campaign.description ?? ''}
            rows={3}
          />
          <Button type="submit" loading={saveLoading} size="sm" className="self-end">
            Save changes
          </Button>
        </form>
      </Card>

      {/* Notion integration (DM-only) */}
      {campaignId && <NotionSettingsCard campaignId={campaignId} />}

      <div className="mb-5" />

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        {removeError && <Alert message={removeError} />}
        <ul className="flex flex-col gap-3">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 text-xs font-semibold shrink-0">
                  {member.profiles?.display_name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {member.profiles?.display_name ?? 'Unknown'}
                    {member.user_id === currentUserId && (
                      <span className="text-zinc-500 font-normal"> (you)</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={member.role === 'dm' ? 'dm' : 'player'}>
                  {member.role === 'dm' ? 'DM' : 'Player'}
                </Badge>
                {member.role === 'player' && (
                  <Button
                    variant="danger"
                    size="sm"
                    loading={removingMemberId === member.id}
                    disabled={Boolean(removingMemberId)}
                    onClick={() => handleRemove(member.id)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {nonDMMembers.length === 0 && (
          <p className="text-sm text-zinc-500 mt-3">No players have joined yet.</p>
        )}
      </Card>
    </div>
  )
}
