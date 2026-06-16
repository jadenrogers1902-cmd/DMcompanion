import { Badge } from '@/components/ui/Badge'
import type { CampaignMemberWithProfile } from '@/lib/types/database'

interface MemberListProps {
  members: CampaignMemberWithProfile[]
  currentUserId: string
}

export function MemberList({ members, currentUserId }: MemberListProps) {
  if (members.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-2">No members yet.</p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => (
        <li
          key={member.id}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 text-xs font-semibold shrink-0">
              {member.profiles?.display_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">
                {member.profiles?.display_name ?? 'Unknown'}
                {member.user_id === currentUserId && (
                  <span className="text-zinc-500 font-normal"> (you)</span>
                )}
              </p>
            </div>
          </div>
          <Badge variant={member.role === 'dm' ? 'dm' : 'player'}>
            {member.role === 'dm' ? 'DM' : 'Player'}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
