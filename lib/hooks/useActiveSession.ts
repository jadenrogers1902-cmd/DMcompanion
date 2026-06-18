'use client'

import { useEffect, useId, useState } from 'react'
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
 *
 * Resilient by design: this hook renders on every campaign page (nav + cards),
 * sometimes several instances at once. If the campaign_sessions table is missing
 * (migration not applied) or the query fails, it degrades to "not live" and
 * never subscribes — so a missing migration can't crash player pages. Channel
 * names are made unique per instance to avoid same-topic collisions.
 */
export function useActiveSession(campaignId: string | null): ActiveSessionState {
  const [state, setState] = useState<ActiveSessionState>(EMPTY)
  const instanceId = useId()

  useEffect(() => {
    if (!campaignId) return

    const id = campaignId
    let cancelled = false
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function refresh() {
      const { data, error } = await supabase
        .from('campaign_sessions')
        .select('started_at')
        .eq('campaign_id', id)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        // Table not reachable yet (e.g. migration not applied). Degrade quietly
        // and don't open a realtime channel against a table that isn't there.
        setState({ isLive: false, startedAt: null, loaded: true })
        return
      }
      setState({ isLive: Boolean(data), startedAt: data?.started_at ?? null, loaded: true })

      // Subscribe only after a successful read confirms the table exists.
      if (!channel) {
        try {
          channel = supabase
            .channel(`campaign-session-${id}-${instanceId}`)
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'campaign_sessions', filter: `campaign_id=eq.${id}` },
              () => refresh(),
            )
            .subscribe()
        } catch {
          channel = null
        }
      }
    }

    refresh()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [campaignId, instanceId])

  if (!campaignId) return EMPTY
  return state
}
