'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const cache = new Map<string, 'dm' | 'player'>()

export function useCampaignRole(campaignId: string | null, userId: string | undefined) {
  const cacheKey = campaignId && userId ? `${campaignId}:${userId}` : null
  const cachedRole = cacheKey ? cache.get(cacheKey) ?? null : null
  const [fetchedRole, setFetchedRole] = useState<'dm' | 'player' | null>(null)

  useEffect(() => {
    if (!cacheKey || !campaignId || !userId || cache.has(cacheKey)) return

    let cancelled = false
    const supabase = createClient()

    supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        const resolved = data.role as 'dm' | 'player'
        cache.set(cacheKey, resolved)
        setFetchedRole(resolved)
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, campaignId, userId])

  if (!cacheKey) return null
  return cachedRole ?? fetchedRole
}
