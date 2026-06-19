'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createCampaign(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const name = (formData.get('name') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null

  if (!name || name.length < 2) {
    return { error: 'Campaign name must be at least 2 characters.' }
  }

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .insert({ name, description, owner_id: user.id })
    .select()
    .single()

  if (error || !campaign) {
    return { error: error?.message ?? 'Failed to create campaign.' }
  }

  // Add creator as DM member
  await supabase.from('campaign_members').insert({
    campaign_id: campaign.id,
    user_id: user.id,
    role: 'dm',
  })

  redirect(`/campaigns/${campaign.id}`)
}

export async function joinCampaign(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const rawCode = (formData.get('invite_code') as string)?.trim().toUpperCase()
  if (!rawCode) return { error: 'Please enter an invite code.' }

  // Look up campaign by invite code using the security-definer function
  const { data: campaigns, error: lookupError } = await supabase.rpc(
    'get_campaign_by_invite_code',
    { code: rawCode },
  )

  if (lookupError || !campaigns || campaigns.length === 0) {
    return { error: 'Invalid invite code. Please check and try again.' }
  }

  const campaign = campaigns[0]

  // Check not already a member
  const { data: existing } = await supabase
    .from('campaign_members')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    redirect(`/campaigns/${campaign.id}`)
  }

  const { error: joinError } = await supabase.from('campaign_members').insert({
    campaign_id: campaign.id,
    user_id: user.id,
    role: 'player',
  })

  if (joinError) {
    // 23505 = unique_violation — a concurrent request already inserted the
    // membership row (e.g. double-click / two tabs). Treat as success.
    if (joinError.code === '23505') {
      redirect(`/campaigns/${campaign.id}`)
    }
    return { error: joinError.message }
  }

  redirect(`/campaigns/${campaign.id}`)
}

export async function updateCampaign(campaignId: string, formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const name = (formData.get('name') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null

  if (!name || name.length < 2) {
    return { error: 'Campaign name must be at least 2 characters.' }
  }

  const { error } = await supabase
    .from('campaigns')
    .update({ name, description })
    .eq('id', campaignId)
    .eq('owner_id', user.id)

  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}`)
  return { success: true }
}

export async function removeMember(campaignId: string, memberId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membership?.role !== 'dm') {
    return { error: 'Only the DM can remove players from this campaign.' }
  }

  const { data: target } = await supabase
    .from('campaign_members')
    .select('id, role, user_id')
    .eq('id', memberId)
    .eq('campaign_id', campaignId)
    .maybeSingle()

  if (!target) return { error: 'Player membership not found.' }
  if (target.role !== 'player') return { error: 'Only player members can be removed here.' }
  if (target.user_id === user.id) return { error: 'You cannot remove yourself from the campaign.' }

  const { error } = await supabase
    .from('campaign_members')
    .delete()
    .eq('id', memberId)
    .eq('campaign_id', campaignId)
    .eq('role', 'player')

  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/settings`)
  revalidatePath(`/campaigns/${campaignId}`)
  return { success: true }
}

export async function regenerateInviteCode(campaignId: string) {
  const supabase = await createClient()

  const { data: newCode, error } = await supabase.rpc(
    'regenerate_invite_code',
    { campaign_id: campaignId },
  )

  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/settings`)
  return { code: newCode }
}
