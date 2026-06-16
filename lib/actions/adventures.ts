'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'
import type { AdventureStatus, PrepImportantLink, PrepNote } from '@/lib/types/adventure'
import { normalizePrepLinks, normalizePrepNotes, normalizeTags } from '@/components/adventures/prep-metadata'

type AdventureUpdate = Database['public']['Tables']['adventures']['Update']

const ADVENTURE_STATUSES: AdventureStatus[] = ['draft', 'ready', 'active', 'archived']

function normalizeStatus(value: string | undefined): AdventureStatus | null {
  if (value === undefined) return null
  return ADVENTURE_STATUSES.includes(value as AdventureStatus)
    ? (value as AdventureStatus)
    : null
}

export async function createAdventure(
  campaignId: string,
  input: { title: string; description?: string },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const title = input.title?.trim()
  if (!title) return { error: 'Adventure title is required.' }

  // RLS (adventures_dm_all) rejects this insert for non-DM members.
  const { data: adventure, error } = await supabase
    .from('adventures')
    .insert({
      campaign_id: campaignId,
      title,
      description: input.description?.trim() || null,
    })
    .select()
    .single()

  if (error || !adventure) {
    return { error: error?.message ?? 'Failed to create adventure.' }
  }

  revalidatePath(`/campaigns/${campaignId}/adventures`)
  return { adventureId: adventure.id }
}

export async function updateAdventure(
  campaignId: string,
  adventureId: string,
  input: {
    title?: string
    description?: string | null
    status?: string
    prep_notes?: PrepNote[]
    important_links?: PrepImportantLink[]
    tags?: string[]
  },
) {
  const supabase = await createClient()
  const update: AdventureUpdate = {}

  if (input.title !== undefined) {
    const title = input.title.trim()
    if (!title) return { error: 'Adventure title is required.' }
    update.title = title
  }
  if (input.description !== undefined) {
    update.description = input.description?.trim() || null
  }
  if (input.status !== undefined) {
    const status = normalizeStatus(input.status)
    if (!status) return { error: 'Invalid adventure status.' }
    update.status = status
  }
  if (input.prep_notes !== undefined) {
    update.prep_notes = normalizePrepNotes(input.prep_notes, 'adventure', adventureId)
  }
  if (input.important_links !== undefined) {
    update.important_links = normalizePrepLinks(input.important_links, 'adventure', adventureId)
  }
  if (input.tags !== undefined) {
    update.tags = normalizeTags(input.tags)
  }

  const { error } = await supabase
    .from('adventures')
    .update(update)
    .eq('id', adventureId)
    .eq('campaign_id', campaignId)
  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/adventures`)
  revalidatePath(`/campaigns/${campaignId}/adventures/${adventureId}`)
  return { success: true }
}

export async function deleteAdventure(campaignId: string, adventureId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('adventures')
    .delete()
    .eq('id', adventureId)
    .eq('campaign_id', campaignId)
  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/adventures`)
  redirect(`/campaigns/${campaignId}/adventures`)
}
