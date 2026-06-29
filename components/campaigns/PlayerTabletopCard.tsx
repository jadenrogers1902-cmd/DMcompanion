'use client'

import Link from 'next/link'
import { Card, CardDescription } from '@/components/ui/Card'
import { useActiveSession } from '@/lib/hooks/useActiveSession'

/**
 * Player dashboard entry into the live map. While the DM has a session running,
 * it becomes the red "Tabletop" card signalling the table is live; otherwise it
 * is the normal "Adventure" card. Updates live via realtime — no refresh.
 */
export function PlayerTabletopCard({ campaignId }: { campaignId: string }) {
  const session = useActiveSession(campaignId)
  const live = session.isLive

  return (
    <Link href={`/campaigns/${campaignId}/live-map`}>
      <Card
        className={`h-full cursor-pointer transition-all ${
          live
            ? 'border-red-500/70 bg-red-500/10 ring-1 ring-red-500/40 hover:bg-red-500/15'
            : 'hover:border-zinc-600 hover:bg-zinc-800/50'
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {live && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
            )}
            <h3 className={`text-sm font-medium ${live ? 'text-red-200' : 'text-zinc-200'}`}>
              {live ? 'Tabletop' : 'Adventure'}
            </h3>
          </div>
          {live ? (
            <span className="rounded-full border border-red-500/50 bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
              Live
            </span>
          ) : (
            <svg className="h-4 w-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          )}
        </div>
        <CardDescription className={live ? 'text-red-300/90' : 'text-zinc-500'}>
          {live
            ? 'Your session is live — jump in to the active scene, move your token, and act.'
            : "Jump into the live map, move your token, and act on what's around you."}
        </CardDescription>
      </Card>
    </Link>
  )
}
