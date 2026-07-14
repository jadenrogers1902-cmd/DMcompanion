import type { LucideIcon } from 'lucide-react'
import {
  BookMarked,
  BookOpen,
  Compass,
  Ellipsis,
  FileClock,
  Inbox,
  LayoutDashboard,
  Library,
  MapPinned,
  NotebookTabs,
  RefreshCw,
  ScrollText,
  Settings,
  Swords,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react'

export type CampaignRole = 'dm' | 'player' | null

export interface NavigationItem {
  href: string
  label: string
  icon: LucideIcon
  exact?: boolean
  live?: boolean
  mobileLabel?: string
}

export const globalNavigationItems: NavigationItem[] = [
  {
    href: '/dashboard',
    label: 'Campaigns',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: '/join',
    label: 'Join Campaign',
    mobileLabel: 'Join',
    icon: UserPlus,
  },
]

export const accountNavigationItem: NavigationItem = {
  href: '/settings',
  label: 'Account Settings',
  mobileLabel: 'Settings',
  icon: Settings,
}

export function campaignIdFromPath(pathname: string) {
  const match = pathname.match(/^\/campaigns\/([^/]+)/)
  return match?.[1] && match[1] !== 'new' ? match[1] : null
}

export function getCampaignNavigationItems(
  campaignId: string,
  role: CampaignRole,
  liveForPlayer: boolean,
): NavigationItem[] {
  if (role === null) return []

  if (role === 'dm') {
    return [
      { href: `/campaigns/${campaignId}`, label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { href: `/campaigns/${campaignId}/live-map`, label: 'Live Map', icon: MapPinned },
      { href: `/campaigns/${campaignId}/adventures`, label: 'Adventure Maker', icon: Compass },
      { href: `/campaigns/${campaignId}/codex`, label: 'Adventure Codex', icon: BookOpen },
      { href: `/campaigns/${campaignId}/codex/sync`, label: 'Table Sync', icon: RefreshCw },
      { href: `/campaigns/${campaignId}/characters`, label: 'Players', icon: Users },
      { href: `/campaigns/${campaignId}/actions`, label: 'Requests', icon: Inbox },
      { href: `/campaigns/${campaignId}/encounters`, label: 'Encounters', icon: Swords },
      { href: `/campaigns/${campaignId}/story`, label: 'Story', icon: ScrollText },
      { href: `/campaigns/${campaignId}/settings`, label: 'Settings', icon: Settings },
    ]
  }

  return [
    { href: `/campaigns/${campaignId}`, label: 'Dashboard', icon: LayoutDashboard, exact: true },
    {
      href: `/campaigns/${campaignId}/live-map`,
      label: 'Adventure',
      icon: MapPinned,
      live: liveForPlayer,
    },
    { href: `/campaigns/${campaignId}/codex`, label: 'Revealed Info', icon: BookMarked },
    { href: `/campaigns/${campaignId}/characters`, label: 'Characters', icon: UserRound },
    { href: `/campaigns/${campaignId}/encounters`, label: 'Encounters', icon: Swords },
    { href: `/campaigns/${campaignId}/story`, label: 'Journal', icon: NotebookTabs },
  ]
}

export function getCampaignMobileItems(
  campaignId: string,
  role: CampaignRole,
  liveForPlayer: boolean,
): NavigationItem[] {
  if (role === null) {
    return [
      { href: `/campaigns/${campaignId}`, label: 'Home', icon: LayoutDashboard, exact: true },
      { href: `/campaigns/${campaignId}/characters`, label: 'Characters', icon: UserRound },
      { href: `/campaigns/${campaignId}/live-map`, label: 'Map', icon: MapPinned },
    ]
  }

  if (role === 'dm') {
    return [
      { href: `/campaigns/${campaignId}`, label: 'Home', icon: LayoutDashboard, exact: true },
      { href: `/campaigns/${campaignId}/characters`, label: 'Characters', icon: UserRound },
      { href: `/campaigns/${campaignId}/live-map`, label: 'Live Map', icon: MapPinned },
      { href: `/campaigns/${campaignId}/actions`, label: 'Act', icon: FileClock },
      { href: `/campaigns/${campaignId}/story`, label: 'Journal', icon: NotebookTabs },
      { href: `/campaigns/${campaignId}/codex`, label: 'Codex', icon: BookOpen },
      accountNavigationItem,
    ]
  }

  return [
    { href: `/campaigns/${campaignId}`, label: 'Home', icon: LayoutDashboard, exact: true },
    { href: `/campaigns/${campaignId}/characters`, label: 'Characters', icon: UserRound },
    {
      href: `/campaigns/${campaignId}/live-map`,
      label: 'Adventure',
      icon: MapPinned,
      live: liveForPlayer,
    },
  ]
}

export function getPlayerMoreItems(campaignId: string): NavigationItem[] {
  return [
    { href: `/campaigns/${campaignId}/encounters`, label: 'Encounters', icon: Swords },
    { href: `/campaigns/${campaignId}/story`, label: 'Journal', icon: NotebookTabs },
    { href: `/campaigns/${campaignId}/codex`, label: 'Revealed Info', icon: BookMarked },
    accountNavigationItem,
    { href: '/dashboard', label: 'All Campaigns', icon: Library, exact: true },
    { href: '/join', label: 'Join Campaign', icon: UserPlus },
  ]
}

export function navigationItemMatches(pathname: string, item: NavigationItem) {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function activeNavigationHref(pathname: string, items: NavigationItem[]) {
  return items.reduce((best, item) => {
    if (!navigationItemMatches(pathname, item)) return best
    return item.href.length > best.length ? item.href : best
  }, '')
}

export const moreNavigationIcon = Ellipsis
