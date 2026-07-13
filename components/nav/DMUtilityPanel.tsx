'use client'

import Link from 'next/link'
import { useSyncExternalStore, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardDescription, CardEyebrow, CardTitle } from '@/components/ui/Card'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)

  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getSnapshot() {
  return navigator.onLine
}

function getServerSnapshot() {
  return true
}

interface DMUtilityPanelProps {
  campaignId: string
  campaignName: string
  activeMapName?: string | null
  pendingRequests?: number
  memberCount?: number
  characterCount?: number
  className?: string
}

export function DMUtilityPanel({
  campaignId,
  campaignName,
  activeMapName,
  pendingRequests = 0,
  memberCount,
  characterCount,
  className = '',
}: DMUtilityPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (collapsed) {
    return (
      <aside className={`hidden xl:block ${className}`}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="sticky top-4 flex h-11 w-11 items-center justify-center rounded-lg border border-dm-only/40 bg-panel text-sm font-semibold text-dm-only shadow-xl transition hover:border-dm-only/70 hover:bg-panel-raised"
          aria-label="Open DM utility panel"
        >
          DM
        </button>
      </aside>
    )
  }

  return (
    <aside className={`hidden xl:block ${className}`}>
      <Card
        tone="subtle"
        rounded="xl"
        padding="sm"
        className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto border-border-strong bg-overlay/95 shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardEyebrow className="text-dm-only">DM Utility</CardEyebrow>
            <CardTitle className="truncate text-sm">{campaignName}</CardTitle>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded-md px-2 py-1 text-xs text-faint transition hover:bg-hover hover:text-content"
          >
            Hide panel
          </button>
        </div>

        <div className="grid gap-2">
          <Card tone="panel" rounded="lg" padding="xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted">Realtime</span>
              <Badge variant={online ? 'success' : 'warning'}>{online ? 'Live' : 'Offline'}</Badge>
            </div>
            <CardDescription className="mt-1 text-faint">
              Realtime views refetch when subscribed campaign rows change.
            </CardDescription>
          </Card>

          <Card tone="panel" rounded="lg" padding="xs">
            <CardDescription>Active scene</CardDescription>
            <p className="mt-1 truncate text-sm font-medium text-content">
              {activeMapName || 'No active map'}
            </p>
          </Card>

          <Link
            href={`/campaigns/${campaignId}/actions`}
            className="transition"
          >
            <Card tone="interactive" rounded="lg" padding="xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-content">Action requests</span>
                <Badge variant={pendingRequests > 0 ? 'warning' : 'default'}>{pendingRequests}</Badge>
              </div>
              <CardDescription className="mt-1 text-faint">Approve, deny, ask for rolls, or resolve.</CardDescription>
            </Card>
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {memberCount !== undefined && (
            <Metric label="Members" value={memberCount} />
          )}
          {characterCount !== undefined && (
            <Metric label="Characters" value={characterCount} />
          )}
        </div>

        <div className="mt-4 grid gap-2">
          <QuickLink href={`/campaigns/${campaignId}/live-map`} label="Go to Live Map" />
          <QuickLink href={`/campaigns/${campaignId}/adventures`} label="Adventure Maker" />
          <QuickLink href={`/campaigns/${campaignId}/characters`} label="Player Stats" />
          <QuickLink href={`/campaigns/${campaignId}/encounters`} label="Encounters" />
          <QuickLink href={`/campaigns/${campaignId}/story`} label="Story Tools" />
          <QuickLink href={`/campaigns/${campaignId}/export`} label="Export Backup" />
          <QuickLink href={`/campaigns/${campaignId}/settings`} label="Campaign Settings" />
        </div>
      </Card>
    </aside>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card tone="panel" rounded="lg" padding="xs">
      <p className="text-lg font-semibold text-content">{value}</p>
      <CardDescription className="text-faint">{label}</CardDescription>
    </Card>
  )
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-panel-raised/65 px-3 py-2 text-sm text-muted transition hover:border-accent/45 hover:bg-hover hover:text-content"
    >
      {label}
    </Link>
  )
}
