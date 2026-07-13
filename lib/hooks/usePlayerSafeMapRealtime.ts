'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PlayerLiveMapSnapshot } from '@/lib/types/database'
import type { RealtimeConnectionState } from './useRealtimeRefresh'

interface PlayerSafeMapRealtimeHandlers {
  onSnapshot: (snapshot: PlayerLiveMapSnapshot) => void
  onUnavailable?: () => void
  onStatus?: (status: string) => void
}

const RETRY_BASE_MS = 1_200
const RETRY_CAP_MS = 30_000

function retryDelay(attempt: number) {
  const exponential = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * (2 ** Math.min(attempt, 5)))
  // A little jitter prevents every player and Center Screen tab from retrying
  // the same degraded Supabase service at exactly the same moment.
  return Math.round(exponential * (0.8 + Math.random() * 0.4))
}

/**
 * Subscribes only to the payload-free player map event stream. Source map,
 * token, room, fog, and wall rows mix DM-only and player-facing columns and
 * must never be subscribed to by a player or Center Screen client.
 *
 * A short debounce collapses multi-row moves/reveals into one direct Supabase
 * RPC fetch. This preserves realtime behavior without a Vercel route refresh.
 */
export function usePlayerSafeMapRealtime(
  campaignId: string,
  mapId: string,
  handlers: PlayerSafeMapRealtimeHandlers,
  followActiveMap = false,
) {
  const handlersRef = useRef(handlers)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotRetryAttemptRef = useRef(0)
  const channelRetryAttemptRef = useRef(0)
  const [retryToken, setRetryToken] = useState(0)
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>('connecting')

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    const supabase = createClient()
    let fetching = false
    let fetchAgain = false
    let disposed = false

    const fetchSnapshot = async () => {
      if (disposed) return
      if (fetching) {
        fetchAgain = true
        return
      }
      fetching = true
      do {
        fetchAgain = false
        const { data, error } = followActiveMap
          ? await supabase.rpc('get_player_active_live_map_snapshot', {
              p_campaign_id: campaignId,
            })
          : await supabase.rpc('get_player_live_map_snapshot', {
              p_map_id: mapId,
            })
        if (disposed) break
        if (error) {
          setConnectionState('stale')
          handlersRef.current.onStatus?.('SNAPSHOT_ERROR')
          if (snapshotRetryRef.current) clearTimeout(snapshotRetryRef.current)
          const attempt = snapshotRetryAttemptRef.current
          snapshotRetryAttemptRef.current += 1
          snapshotRetryRef.current = setTimeout(() => {
            if (disposed) return
            setConnectionState('reconnecting')
            // Snapshot failures do not require a new Realtime channel. Retry
            // the RPC in place so a missing migration or outage cannot churn
            // both database requests and channel connections.
            void fetchSnapshot()
          }, retryDelay(attempt))
          break
        }
        snapshotRetryAttemptRef.current = 0
        if (data) {
          setConnectionState('live')
          handlersRef.current.onSnapshot(data as PlayerLiveMapSnapshot)
        } else {
          handlersRef.current.onUnavailable?.()
        }
      } while (fetchAgain)
      fetching = false
    }

    const fetchSoon = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        void fetchSnapshot()
      }, 100)
    }

    const channel = supabase
      .channel(`player-safe-map-${campaignId}-${mapId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: followActiveMap ? 'player_safe_map_events' : 'center_safe_map_events',
          filter: followActiveMap
            ? `campaign_id=eq.${campaignId}`
            : `map_id=eq.${mapId}`,
        },
        fetchSoon,
      )
      .subscribe((status) => {
        if (disposed) return
        handlersRef.current.onStatus?.(status)
        if (status === 'SUBSCRIBED') {
          channelRetryAttemptRef.current = 0
          setConnectionState('live')
          void fetchSnapshot()
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionState(status === 'CHANNEL_ERROR' ? 'failed' : 'stale')
          if (channelRetryRef.current) clearTimeout(channelRetryRef.current)
          const attempt = channelRetryAttemptRef.current
          channelRetryAttemptRef.current += 1
          channelRetryRef.current = setTimeout(() => {
            if (disposed) return
            setConnectionState('reconnecting')
            setRetryToken((value) => value + 1)
          }, retryDelay(attempt))
        }
      })

    return () => {
      disposed = true
      if (timerRef.current) clearTimeout(timerRef.current)
      if (snapshotRetryRef.current) clearTimeout(snapshotRetryRef.current)
      if (channelRetryRef.current) clearTimeout(channelRetryRef.current)
      void supabase.removeChannel(channel)
    }
  }, [campaignId, followActiveMap, mapId, retryToken])

  return connectionState
}
