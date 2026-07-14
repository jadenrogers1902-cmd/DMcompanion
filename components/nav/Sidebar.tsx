'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'
import { logout } from '@/lib/actions/auth'
import { useCampaignRole } from '@/lib/hooks/useCampaignRole'
import { useActiveSession } from '@/lib/hooks/useActiveSession'
import type { Profile } from '@/lib/types/database'
import {
  activeNavigationHref,
  campaignIdFromPath,
  getCampaignNavigationItems,
  globalNavigationItems,
} from '@/components/nav/campaign-navigation'

interface SidebarProps {
  profile: Profile | null
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const campaignId = campaignIdFromPath(pathname)
  const role = useCampaignRole(campaignId, profile?.id)
  const session = useActiveSession(role === 'player' ? campaignId : null)
  const liveForPlayer = role === 'player' && session.isLive
  const campaignItems = campaignId
    ? getCampaignNavigationItems(campaignId, role, liveForPlayer)
    : []
  const activeGlobalHref = activeNavigationHref(pathname, globalNavigationItems)
  const activeCampaignHref = activeNavigationHref(pathname, campaignItems)

  return (
    <aside
      className={`hidden h-dvh shrink-0 flex-col border-r border-border bg-shell/95 shadow-[12px_0_44px_rgb(0_0_0/0.16)] backdrop-blur-xl transition-[width] duration-200 md:flex ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className={`flex items-center gap-3 border-b border-border px-3 py-4 ${collapsed ? 'justify-center' : ''}`}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 shadow-[0_0_24px_color-mix(in_srgb,var(--theme-accent)_10%,transparent)]">
          <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        {!collapsed && <span className="font-display text-lg font-semibold tracking-wide text-content">DM Companion</span>}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3" aria-label="Main navigation">
        {globalNavigationItems.map((item) => {
          const Icon = item.icon
          const isActive = item.href === activeGlobalHref
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-11 items-center rounded-lg text-sm transition-colors ${
                collapsed ? 'min-w-11 justify-center px-2' : 'gap-3 px-3'
              } ${
                isActive
                  ? 'bg-accent/12 text-accent ring-1 ring-inset ring-accent/20'
                  : 'text-muted hover:bg-hover/65 hover:text-content'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {!collapsed && item.label}
            </Link>
          )
        })}

        {campaignItems.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            {!collapsed && (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
                Current Campaign
              </p>
            )}
            <div className="flex flex-col gap-1">
              {campaignItems.map((item) => {
                const Icon = item.icon
                const isActive = item.href === activeCampaignHref
                const stateClass = item.live
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
                    aria-label={collapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative flex min-h-11 items-center rounded-lg text-sm transition-colors ${
                      collapsed ? 'min-w-11 justify-center px-2' : 'gap-3 px-3'
                    } ${stateClass}`}
                  >
                    <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    {!collapsed && <span>{item.label}</span>}
                    {item.live && (
                      <>
                        <span className={collapsed ? 'absolute right-2 top-2 flex h-2 w-2' : 'ml-auto flex h-2 w-2'} aria-hidden="true">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-70 motion-reduce:animate-none" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
                        </span>
                        <span className="sr-only">Session live</span>
                      </>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-border px-2 py-3">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className={`mb-2 flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-panel px-2 text-xs text-faint transition hover:border-border-strong hover:bg-panel-raised hover:text-content ${collapsed ? '' : 'gap-2'}`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              Collapse
            </>
          )}
        </button>
        <Link
          href="/settings"
          title={collapsed ? 'Account Settings' : undefined}
          aria-label={collapsed ? 'Account Settings' : undefined}
          aria-current={pathname === '/settings' ? 'page' : undefined}
          className={`mb-1 flex min-h-11 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-hover/65 ${collapsed ? 'min-w-11 justify-center' : ''} ${
            pathname === '/settings' ? 'bg-accent/12 ring-1 ring-inset ring-accent/20' : ''
          }`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/15 text-xs font-semibold text-accent">
            {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-muted">{profile?.display_name ?? 'Adventurer'}</span>
              <span className="block text-[11px] text-faint">Account Settings</span>
            </span>
          )}
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className={`flex min-h-11 w-full items-center rounded-lg text-sm text-faint transition-colors hover:bg-hover/65 hover:text-muted ${
              collapsed ? 'min-w-11 justify-center px-2' : 'gap-3 px-3'
            }`}
            title={collapsed ? 'Sign out' : undefined}
            aria-label={collapsed ? 'Sign out' : undefined}
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {!collapsed && 'Sign out'}
          </button>
        </form>
      </div>
    </aside>
  )
}
