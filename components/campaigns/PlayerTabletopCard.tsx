'use client'

import { MapPinned } from 'lucide-react'
import { PlayerDestinationCard } from '@/components/campaigns/PlayerDestinationCard'
import { useActiveSession } from '@/lib/hooks/useActiveSession'

interface PlayerTabletopCardProps {
  campaignId: string
  className?: string
}

/** Player entry into the map; realtime changes only the live status, never its name. */
export function PlayerTabletopCard({ campaignId, className }: PlayerTabletopCardProps) {
  const session = useActiveSession(campaignId)
  const live = session.isLive

  return (
    <PlayerDestinationCard
      href={`/campaigns/${campaignId}/live-map`}
      title="Adventure"
      description={live ? 'Session live — enter the active scene.' : 'Open the map, move, explore, and act.'}
      imageSrc="/player-ui/destinations/adventure.webp"
      icon={MapPinned}
      live={live}
      className={className}
    />
  )
}
