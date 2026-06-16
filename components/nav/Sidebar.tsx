'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { logout } from '@/lib/actions/auth'
import { useCampaignRole } from '@/lib/hooks/useCampaignRole'
import type { Profile } from '@/lib/types/database'

interface SidebarProps {
  profile: Profile | null
}

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
    label: 'Join Campaign',
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

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const campaignId = campaignIdFromPath(pathname)
  const role = useCampaignRole(campaignId, profile?.id)
  const mapLabel = role === 'dm' ? 'Live Map' : 'Adventure'
  const campaignNavItems = campaignId
    ? [
        { href: `/campaigns/${campaignId}`, label: 'Dashboard', short: 'D' },
        { href: `/campaigns/${campaignId}/live-map`, label: mapLabel, short: 'M' },
        ...(role === 'dm'
          ? [{ href: `/campaigns/${campaignId}/adventures`, label: 'Adventure Maker', short: 'A' }]
          : []),
        { href: `/campaigns/${campaignId}/codex`, label: role === 'dm' ? 'Adventure Codex' : 'Revealed Info', short: 'C' },
        ...(role === 'dm'
          ? [{ href: `/campaigns/${campaignId}/codex/sync`, label: 'Table Sync', short: 'N' }]
          : []),
        { href: `/campaigns/${campaignId}/characters`, label: 'Players', short: 'P' },
        ...(role === 'dm'
          ? [{ href: `/campaigns/${campaignId}/actions`, label: 'Requests', short: 'R' }]
          : []),
        { href: `/campaigns/${campaignId}/encounters`, label: 'Encounters', short: 'E' },
        { href: `/campaigns/${campaignId}/story`, label: 'Story', short: 'S' },
        { href: `/campaigns/${campaignId}/settings`, label: 'Settings', short: 'G' },
      ]
    : []

  return (
    <aside
      className={`hidden h-screen shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 transition-[width] duration-200 md:flex ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 border-b border-zinc-800 px-3 py-4 ${collapsed ? 'justify-center' : ''}`}>
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        {!collapsed && <span className="font-semibold text-zinc-100 text-sm">DM Companion</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`
                flex items-center rounded-lg text-sm transition-colors
                ${collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'}
                ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }
              `.trim()}
            >
              {item.icon}
              {!collapsed && item.label}
            </Link>
          )
        })}
        {campaignNavItems.length > 0 && (
          <div className="mt-5 pt-4 border-t border-zinc-900">
            {!collapsed && <p className="px-3 mb-2 text-[11px] uppercase tracking-wide text-zinc-600">
              Current Campaign
            </p>}
            <div className="flex flex-col gap-1">
              {/* Longest-prefix match so a child route (e.g. /codex/sync) only
                  highlights its own item, not the parent (/codex). */}
              {(() => {
                const activeHref = campaignNavItems.reduce<string>((best, item) => {
                  const matches = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  if (!matches) return best
                  return item.href.length > best.length ? item.href : best
                }, '')
                return campaignNavItems.map((item) => {
                  const isActive = item.href === activeHref
                  return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`
                      rounded-lg text-sm transition-colors
                      ${collapsed ? 'px-2 py-2.5 text-center font-semibold' : 'px-3 py-2'}
                      ${
                        isActive
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
                      }
                    `.trim()}
                  >
                    {collapsed ? item.short : item.label}
                  </Link>
                )
                })
              })()}
            </div>
          </div>
        )}
      </nav>

      {/* User / logout */}
      <div className="border-t border-zinc-800 px-2 py-3">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="mb-2 flex w-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-zinc-400 transition hover:text-zinc-100"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '>>' : 'Collapse'}
        </button>
        <div className={`flex items-center gap-3 px-2 py-2 mb-1 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xs font-semibold shrink-0">
            {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          {!collapsed && <span className="text-sm text-zinc-300 truncate">
            {profile?.display_name ?? 'Adventurer'}
          </span>}
        </div>
        <form action={logout}>
          <button
            type="submit"
            className={`flex w-full items-center rounded-lg text-sm text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300 ${
              collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'
            }`}
            title={collapsed ? 'Sign out' : undefined}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            {!collapsed && 'Sign out'}
          </button>
        </form>
      </div>
    </aside>
  )
}
