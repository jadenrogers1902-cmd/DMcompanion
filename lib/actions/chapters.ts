'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'
import type { AdventureStatus, PrepImportantLink, PrepNote } from '@/lib/types/adventure'
import { normalizePrepLinks, normalizePrepNotes, normalizeTags } from '@/components/adventures/prep-metadata'

type ChapterUpdate = Database['public']['Tables']['adventure_chapters']['Update']

const CHAPTER_STATUSES: AdventureStatus[] = ['draft', 'ready', 'active', 'archived']

function revalidateChapterPaths(campaignId: string, adventureId: string, chapterId?: string) {
  revalidatePath(`/campaigns/${campaignId}/adventures`)
  revalidatePath(`/campaigns/${campaignId}/adventures/${adventureId}`)
  if (chapterId) {
    revalidatePath(`/campaigns/${campaignId}/adventures/${adventureId}/chapters/${chapterId}`)
  }
}

export async function createChapter(
  campaignId: string,
  adventureId: string,
  input: { title: string; description?: string },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const title = input.title?.trim()
  if (!title) return { error: 'Chapter title is required.' }

  // Append to the end of the adventure's chapter order.
  const { data: last } = await supabase
    .from('adventure_chapters')
    .select('sort_order')
    .eq('adventure_id', adventureId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  // RLS (adventure_chapters_dm_all) rejects this insert for non-DM members.
  const { data: chapter, error } = await supabase
    .from('adventure_chapters')
    .insert({
      adventure_id: adventureId,
      campaign_id: campaignId,
      title,
      description: input.description?.trim() || null,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select()
    .single()

  if (error || !chapter) {
    return { error: error?.message ?? 'Failed to create chapter.' }
  }

  revalidateChapterPaths(campaignId, adventureId)
  return { chapterId: chapter.id }
}

export async function updateChapter(
  campaignId: string,
  adventureId: string,
  chapterId: string,
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
  const update: ChapterUpdate = {}

  if (input.title !== undefined) {
    const title = input.title.trim()
    if (!title) return { error: 'Chapter title is required.' }
    update.title = title
  }
  if (input.description !== undefined) {
    update.description = input.description?.trim() || null
  }
  if (input.status !== undefined) {
    if (!CHAPTER_STATUSES.includes(input.status as AdventureStatus)) {
      return { error: 'Invalid chapter status.' }
    }
    update.status = input.status
  }
  if (input.prep_notes !== undefined) {
    update.prep_notes = normalizePrepNotes(input.prep_notes, 'chapter', chapterId)
  }
  if (input.important_links !== undefined) {
    update.important_links = normalizePrepLinks(input.important_links, 'chapter', chapterId)
  }
  if (input.tags !== undefined) {
    update.tags = normalizeTags(input.tags)
  }

  const { error } = await supabase
    .from('adventure_chapters')
    .update(update)
    .eq('id', chapterId)
    .eq('adventure_id', adventureId)
  if (error) return { error: error.message }

  revalidateChapterPaths(campaignId, adventureId, chapterId)
  return { success: true }
}

export async function deleteChapter(
  campaignId: string,
  adventureId: string,
  chapterId: string,
) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('adventure_chapters')
    .delete()
    .eq('id', chapterId)
    .eq('adventure_id', adventureId)
  if (error) return { error: error.message }

  revalidateChapterPaths(campaignId, adventureId)
  redirect(`/campaigns/${campaignId}/adventures/${adventureId}`)
}

export async function moveChapter(
  campaignId: string,
  adventureId: string,
  chapterId: string,
  direction: 'up' | 'down',
) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('adventure_chapters')
    .select('id, sort_order')
    .eq('adventure_id', adventureId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  const chapters = data ?? []

  const index = chapters.findIndex((chapter) => chapter.id === chapterId)
  if (index === -1) return { error: 'Chapter not found.' }

  const neighborIndex = direction === 'up' ? index - 1 : index + 1
  if (neighborIndex < 0 || neighborIndex >= chapters.length) {
    return { success: true } // already at the edge; nothing to do
  }

  const current = chapters[index]
  const neighbor = chapters[neighborIndex]

  // Swap sort positions. If legacy rows share a sort_order value, fall back
  // to index-based values so the pair still ends up unambiguous.
  let currentNew = neighbor.sort_order
  let neighborNew = current.sort_order
  if (currentNew === neighborNew) {
    currentNew = neighborIndex + 1
    neighborNew = index + 1
  }

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from('adventure_chapters').update({ sort_order: currentNew }).eq('id', current.id),
    supabase.from('adventure_chapters').update({ sort_order: neighborNew }).eq('id', neighbor.id),
  ])
  if (e1 || e2) return { error: (e1 ?? e2)?.message ?? 'Failed to reorder chapter.' }

  revalidateChapterPaths(campaignId, adventureId)
  return { success: true }
}
