import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import type { CampaignWithRole } from '@/lib/types/database'

interface CampaignCardProps {
  campaign: CampaignWithRole
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  return (
    <Link href={`/campaigns/${campaign.id}`}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-600 hover:bg-zinc-800/50 transition-all cursor-pointer group">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors leading-snug">
            {campaign.name}
          </h3>
          <Badge variant={campaign.member_role === 'dm' ? 'dm' : 'player'}>
            {campaign.member_role === 'dm' ? 'DM' : 'Player'}
          </Badge>
        </div>
        {campaign.description && (
          <p className="text-sm text-zinc-500 leading-relaxed line-clamp-2 mb-3">
            {campaign.description}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-zinc-600">
          <span>{campaign.member_count} {campaign.member_count === 1 ? 'member' : 'members'}</span>
          <span>·</span>
          <span>
            {new Date(campaign.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>
    </Link>
  )
}
