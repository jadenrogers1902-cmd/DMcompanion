'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GameMap, MapRevealedArea, MapRoomRegion, Token } from '@/lib/types/database'
import type { RealtimeConnectionState } from './useRealtimeRefresh'

type TokenRow = Token & { dm_notes?: string | null }

interface Handlers {
  onUpsert?: (token: TokenRow) => void
  onDelete?: (id: string) => void
  onMapChange?: (map: GameMap) => void
  onAreaUpsert?: (area: MapRevealedArea) => void
  onAreaDelete?: (id: string) => void
  onRoomUpsert?: (room: MapRoomRegion) => void
  onRoomDelete?: (id: string) => void
  onStatus?: (status: string) => void
}

/**
 * Subscribes to live token changes for a map (and map-lock changes).
 * RLS is applied per-subscriber, so players only receive rows they may see.
 */
export function useTokenRealtime(
  mapId: string,
  campaignId: string,
  handlers: Handlers,
) {
  // Keep latest handlers without re-subscribing on every render.
  const ref = useRef(handlers)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('connecting')
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`map-${mapId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tokens',
          filter: `map_id=eq.${mapId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id?: string }
            if (oldRow?.id) ref.current.onDelete?.(oldRow.id)
          } else {
            ref.current.onUpsert?.(payload.new as TokenRow)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'maps',
          filter: `id=eq.${mapId}`,
        },
        (payload) => {
          const m = payload.new as GameMap
          ref.current.onMapChange?.(m)
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'map_revealed_areas',
          filter: `map_id=eq.${mapId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id?: string }
            if (oldRow?.id) ref.current.onAreaDelete?.(oldRow.id)
          } else {
            ref.current.onAreaUpsert?.(payload.new as MapRevealedArea)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'map_room_regions',
          filter: `map_id=eq.${mapId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id?: string }
            if (oldRow?.id) ref.current.onRoomDelete?.(oldRow.id)
          } else {
            ref.current.onRoomUpsert?.(payload.new as MapRoomRegion)
          }
        },
      )
      .subscribe((status) => {
        ref.current.onStatus?.(status)
        if (status === 'SUBSCRIBED') {
          setConnectionState('live')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionState(status === 'CHANNEL_ERROR' ? 'failed' : 'stale')
          if (retryRef.current) clearTimeout(retryRef.current)
          retryRef.current = setTimeout(() => {
            setConnectionState('reconnecting')
            setRetryToken((value) => value + 1)
          }, 1200)
        }
      })

    return () => {
      if (retryRef.current) clearTimeout(retryRef.current)
      supabase.removeChannel(channel)
    }
  }, [mapId, campaignId, retryToken])

  return connectionState
}
