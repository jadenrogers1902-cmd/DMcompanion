'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCampaignRole } from '@/lib/hooks/useCampaignRole'
import type { Profile } from '@/lib/types/database'

const navItems = [
  {
    href: '/dashboard',
    label: 'Campaigns',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: '/join',
    label: 'Join',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
      </svg>
    ),
  },
]

function campaignIdFromPath(pathname: string) {
  const match = pathname.match(/^\/campaigns\/([^/]+)/)
  return match?.[1] && match[1] !== 'new' ? match[1] : null
}

interface MobileNavProps {
  profile: Profile | null
}

export function MobileNav({ profile }: MobileNavProps) {
  const pathname = usePathname()
  const campaignId = campaignIdFromPath(pathname)
  const role = useCampaignRole(campaignId, profile?.id)
  const mapLabel = role === 'dm' ? 'Live Map' : 'Adventure'
  const items = campaignId
    ? [
        { href: `/campaigns/${campaignId}`, label: 'Home', icon: navItems[0].icon },
        {
          href: `/campaigns/${campaignId}/characters`,
          label: 'Sheet',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75h-9A2.25 2.25 0 005.25 6v12A2.25 2.25 0 007.5 20.25h9A2.25 2.25 0 0018.75 18V6a2.25 2.25 0 00-2.25-2.25zM8.25 8.25h7.5M8.25 12h7.5M8.25 15.75h4.5" />
            </svg>
          ),
        },
        {
          href: `/campaigns/${campaignId}/live-map`,
          label: mapLabel,
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75L3.75 4.5v13.125L9 19.875m0-13.125l6-2.625m-6 2.625v13.125m6-15.75l5.25 2.25V19.5L15 17.25m0-13.125V17.25m0 0l-6 2.625" />
            </svg>
          ),
        },
        ...(role === 'dm'
          ? [{
              href: `/campaigns/${campaignId}/actions`,
              label: 'Act',
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
            }]
          : []),
        {
          href: `/campaigns/${campaignId}/story`,
          label: 'Journal',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a6.75 6.75 0 016.75 6.75v5.25H5.25V13.5A6.75 6.75 0 0112 6.75zM8.25 19.5h7.5" />
            </svg>
          ),
        },
        {
          href: `/campaigns/${campaignId}/codex`,
          label: role === 'dm' ? 'Codex' : 'Info',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75v12m0-12c-1.8-1.1-3.6-1.6-5.25-1.5A1.5 1.5 0 005.25 6.75v10.5a1.5 1.5 0 001.5 1.5c1.65-.1 3.45.4 5.25 1.5m0-13.5c1.8-1.1 3.6-1.6 5.25-1.5a1.5 1.5 0 011.5 1.5v10.5a1.5 1.5 0 01-1.5 1.5c-1.65-.1-3.45.4-5.25 1.5" />
            </svg>
          ),
        },
      ]
    : navItems

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 flex z-10 pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== '/dashboard' &&
            item.href !== `/campaigns/${campaignId}` &&
            pathname.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors min-w-0
              ${isActive ? 'text-amber-400' : 'text-zinc-500'}
            `.trim()}
          >
            {item.icon}
            <span className="truncate max-w-full px-1">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
