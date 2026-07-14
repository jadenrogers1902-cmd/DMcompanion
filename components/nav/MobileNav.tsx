'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCampaignRole } from '@/lib/hooks/useCampaignRole'
import { useActiveSession } from '@/lib/hooks/useActiveSession'
import type { Profile } from '@/lib/types/database'
import {
  accountNavigationItem,
  activeNavigationHref,
  campaignIdFromPath,
  getCampaignMobileItems,
  getPlayerMoreItems,
  globalNavigationItems,
  moreNavigationIcon,
  type NavigationItem,
} from '@/components/nav/campaign-navigation'

interface MobileNavProps {
  profile: Profile | null
}

export function MobileNav({ profile }: MobileNavProps) {
  const pathname = usePathname()
  const [moreContext, setMoreContext] = useState<string | null>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreDialogRef = useRef<HTMLDivElement>(null)
  const campaignId = campaignIdFromPath(pathname)
  const role = useCampaignRole(campaignId, profile?.id)
  const session = useActiveSession(role === 'player' ? campaignId : null)
  const liveForPlayer = role === 'player' && session.isLive
  const showPlayerMore = Boolean(campaignId && role === 'player')
  const moreOpen = showPlayerMore && moreContext === pathname
  const campaignItems = campaignId
    ? getCampaignMobileItems(campaignId, role, liveForPlayer)
    : []
  const items = campaignId
    ? campaignItems
    : [...globalNavigationItems, accountNavigationItem]
  const activeHref = activeNavigationHref(pathname, items)
  const playerMoreItems = campaignId && showPlayerMore ? getPlayerMoreItems(campaignId) : []
  const activeMoreHref = activeNavigationHref(pathname, playerMoreItems)
  const MoreIcon = moreNavigationIcon

  useEffect(() => {
    if (!moreOpen) return

    const dialog = moreDialogRef.current
    const trigger = moreButtonRef.current
    const initiallyFocused = dialog?.querySelector<HTMLElement>('[data-more-initial-focus]')
    initiallyFocused?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMoreContext(null)
        return
      }

      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      trigger?.focus()
    }
  }, [moreOpen])

  function renderItem(item: NavigationItem) {
    const Icon = item.icon
    const isActive = item.href === activeHref
    const colorClass = item.live
      ? 'text-live'
      : isActive
        ? 'text-accent'
        : 'text-faint hover:text-muted'

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        className={`relative flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] transition-colors ${
          isActive ? 'bg-accent/6' : 'hover:bg-hover/45'
        } ${colorClass}`}
      >
        <span className="relative">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          {item.live && (
            <span className="absolute -right-1.5 -top-1 flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
            </span>
          )}
        </span>
        <span className="max-w-full truncate">{item.mobileLabel ?? item.label}</span>
        {item.live && <span className="sr-only">Session live</span>}
      </Link>
    )
  }

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border-strong bg-overlay/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_40px_rgb(0_0_0/0.24)] backdrop-blur-xl md:hidden"
        aria-label={campaignId ? 'Campaign navigation' : 'Main navigation'}
      >
        {items.map(renderItem)}
        {showPlayerMore && (
          <button
            ref={moreButtonRef}
            type="button"
            onClick={() => setMoreContext(pathname)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-controls="player-more-navigation"
            aria-current={activeMoreHref ? 'page' : undefined}
            className={`flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] transition-colors ${
              activeMoreHref
                ? 'bg-accent/6 text-accent'
                : 'text-faint hover:bg-hover/45 hover:text-muted'
            }`}
          >
            <MoreIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            <span>More</span>
          </button>
        )}
      </nav>

      {campaignId && showPlayerMore && moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close more navigation"
            className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm md:hidden"
            onClick={() => setMoreContext(null)}
          />
          <div
            ref={moreDialogRef}
            id="player-more-navigation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-more-navigation-title"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-border-strong bg-overlay px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 shadow-2xl md:hidden"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" aria-hidden="true" />
            <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
              <h2 id="player-more-navigation-title" className="font-display text-lg font-semibold text-content">
                More places
              </h2>
              <button
                type="button"
                data-more-initial-focus
                onClick={() => setMoreContext(null)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-panel text-muted transition hover:border-border-strong hover:bg-hover hover:text-content"
                aria-label="Close more navigation"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav className="grid grid-cols-2 gap-2 pb-2" aria-label="More campaign destinations">
              {playerMoreItems.map((item) => {
                const Icon = item.icon
                const isActive = item.href === activeMoreHref
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreContext(null)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? 'border-accent/40 bg-accent/12 text-accent'
                        : 'border-border bg-panel text-muted hover:border-border-strong hover:bg-hover hover:text-content'
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-shell text-accent">
                      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>
        </>
      )}
    </>
  )
}
