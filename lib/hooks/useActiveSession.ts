'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ActiveSessionState {
  /** True while the campaign has a live session. */
  isLive: boolean
  /** ISO start time of the active session, when live. */
  startedAt: string | null
  /** False until the first fetch resolves (avoids a flash before we know). */
  loaded: boolean
}

const EMPTY: ActiveSessionState = { isLive: false, startedAt: null, loaded: false }

/**
 * Tracks whether the campaign has an active live session, subscribing to
 * realtime so the UI (Tabletop tab, live card) flips the moment the DM starts
 * or ends a session — no manual refresh.
 */
export function useActiveSession(campaignId: string | null): ActiveSessionState {
  const [state, setState] = useState<ActiveSessionState>(EMPTY)

  useEffect(() => {
    if (!campaignId) return

    const id = campaignId
    let cancelled = false
    const supabase = createClient()

    async function refresh() {
      const { data } = await supabase
        .from('campaign_sessions')
        .select('started_at')
        .eq('campaign_id', id)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      setState({ isLive: Boolean(data), startedAt: data?.started_at ?? null, loaded: true })
    }

    refresh()

    const channel = supabase
      .channel(`campaign-session-${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_sessions', filter: `campaign_id=eq.${id}` },
        () => refresh(),
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [campaignId])

  if (!campaignId) return EMPTY
  return state
}
