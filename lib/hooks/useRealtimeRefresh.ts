'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export interface RealtimeWatch {
  table: string
  // Optional postgres_changes filter, e.g. `campaign_id=eq.${campaignId}`
  filter?: string
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
}

export type RealtimeConnectionState = 'connecting' | 'live' | 'reconnecting' | 'stale' | 'failed'

/**
 * Subscribes to one or more tables and asks Next.js to re-fetch the current
 * server-rendered route (`router.refresh()`) — debounced — whenever a row
 * the current user is allowed to see changes.
 *
 * This is the "soft resync" counterpart to the fine-grained `useTokenRealtime`
 * merge-into-state pattern: it's the right tool for screens whose data is a
 * deep join across several tables (action intents + actor/target/profile,
 * encounters + participants, characters + conditions, story content), where
 * hand-merging every realtime payload would be brittle. `router.refresh()`
 * re-runs the server component (so RLS is re-applied server-side — never
 * trusts the realtime payload itself for anything sensitive) and passes fresh
 * props down; existing client-side state (form drafts, etc.) is preserved.
 *
 * RLS still governs exactly which row-change events this subscriber receives
 * — a player only ever gets notified about rows their SELECT policy allows,
 * so this never "leaks" the existence of hidden rows, only triggers a refetch
 * of data the viewer was already allowed to query.
 */
export function useRealtimeRefresh(
  channelName: string,
  watches: RealtimeWatch[],
  options?: { debounceMs?: number; enabled?: boolean; onStatus?: (status: string) => void },
) {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('connecting')
  const watchesKey = JSON.stringify(watches)
  const enabled = options?.enabled ?? true

  useEffect(() => {
    if (!enabled || watches.length === 0) return

    const supabase = createClient()
    let channel = supabase.channel(channelName)

    const refreshSoon = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        router.refresh()
      }, options?.debounceMs ?? 200)
    }

    const retrySoon = () => {
      if (retryRef.current) clearTimeout(retryRef.current)
      retryRef.current = setTimeout(() => {
        setConnectionState('reconnecting')
        setRetryToken((value) => value + 1)
      }, 1200)
    }

    watches.forEach((w) => {
      channel = channel.on(
        'postgres_changes',
        {
          event: w.event ?? '*',
          schema: 'public',
          table: w.table,
          filter: w.filter,
        },
        refreshSoon,
      )
    })

    channel.subscribe((status) => {
      options?.onStatus?.(status)
      if (status === 'SUBSCRIBED') {
        setConnectionState('live')
        refreshSoon()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnectionState(status === 'CHANNEL_ERROR' ? 'failed' : 'stale')
        refreshSoon()
        retrySoon()
      }
    })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (retryRef.current) clearTimeout(retryRef.current)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, watchesKey, enabled, retryToken])

  return connectionState
}
