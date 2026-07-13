'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { logout } from '@/lib/actions/auth'
import { useCampaignRole } from '@/lib/hooks/useCampaignRole'
import { useActiveSession } from '@/lib/hooks/useActiveSession'
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
  const session = useActiveSession(role === 'player' ? campaignId : null)
  const liveForPlayer = role === 'player' && session.isLive
  const mapLabel = role === 'dm' ? 'Live Map' : liveForPlayer ? 'Tabletop' : 'Adventure'
  const campaignNavItems = campaignId
    ? [
        { href: `/campaigns/${campaignId}`, label: 'Dashboard', short: 'D' },
        { href: `/campaigns/${campaignId}/live-map`, label: mapLabel, short: 'M', live: liveForPlayer },
        ...(role === 'dm'
          ? [{ href: `/campaigns/${campaignId}/adventures`, label: 'Adventure Maker', short: 'A' }]
          : []),
        { href: `/campaigns/${campaignId}/codex`, label: role === 'dm' ? 'Adventure Codex' : 'Revealed Info', short: 'C' },
        ...(role === 'dm'
          ? [{ href: `/campaigns/${campaignId}/codex/sync`, label: 'Table Sync', short: 'N' }]
          : []),
        { href: `/campaigns/${campaignId}/characters`, label: role === 'dm' ? 'Players' : 'Characters', short: 'P' },
        ...(role === 'dm'
          ? [{ href: `/campaigns/${campaignId}/actions`, label: 'Requests', short: 'R' }]
          : []),
        { href: `/campaigns/${campaignId}/encounters`, label: 'Encounters', short: 'E' },
        { href: `/campaigns/${campaignId}/story`, label: role === 'dm' ? 'Story' : 'Journal', short: 'S' },
        { href: `/campaigns/${campaignId}/settings`, label: 'Settings', short: 'G' },
      ]
    : []

  return (
    <aside
      className={`hidden h-screen shrink-0 flex-col border-r border-border bg-shell/95 shadow-[12px_0_44px_rgb(0_0_0/0.16)] backdrop-blur-xl transition-[width] duration-200 md:flex ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 border-b border-border px-3 py-4 ${collapsed ? 'justify-center' : ''}`}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 shadow-[0_0_24px_rgb(184_167_255/0.1)]">
          <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        {!collapsed && <span className="font-display text-lg font-semibold tracking-wide text-content">DM Companion</span>}
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
                    ? 'bg-accent/12 text-accent ring-1 ring-inset ring-accent/20'
                    : 'text-muted hover:bg-hover/65 hover:text-content'
                }
              `.trim()}
            >
              {item.icon}
              {!collapsed && item.label}
            </Link>
          )
        })}
        {campaignNavItems.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            {!collapsed && <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
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
                  const itemLive = (item as { live?: boolean }).live === true
                  const stateClass = itemLive
                    ? isActive
                      ? 'bg-live/15 text-live ring-1 ring-live/40'
                      : 'text-live hover:bg-live/10 hover:text-live'
                    : isActive
                      ? 'bg-accent/12 text-accent ring-1 ring-inset ring-accent/20'
                      : 'text-faint hover:bg-hover/65 hover:text-content'
                  return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`
                      flex items-center gap-2 rounded-lg text-sm transition-colors
                      ${collapsed ? 'justify-center px-2 py-2.5 font-semibold' : 'px-3 py-2'}
                      ${stateClass}
                    `.trim()}
                  >
                    {itemLive && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-70" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
                      </span>
                    )}
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
      <div className="border-t border-border px-2 py-3">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="mb-2 flex w-full items-center justify-center rounded-lg border border-border bg-panel px-2 py-2 text-xs text-faint transition hover:border-border-strong hover:bg-panel-raised hover:text-content"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '>>' : 'Collapse'}
        </button>
        <div className={`flex items-center gap-3 px-2 py-2 mb-1 ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/15 text-xs font-semibold text-accent">
            {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          {!collapsed && <span className="truncate text-sm text-muted">
            {profile?.display_name ?? 'Adventurer'}
          </span>}
        </div>
        <form action={logout}>
          <button
            type="submit"
            className={`flex w-full items-center rounded-lg text-sm text-faint transition-colors hover:bg-hover/65 hover:text-muted ${
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
