import type { AdventureStatus } from '@/lib/types/adventure'

export const ADVENTURE_STATUS_OPTIONS: { value: AdventureStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'active', label: 'In Progress' },
  { value: 'archived', label: 'Archived' },
]

export function adventureStatusLabel(status: AdventureStatus | string) {
  return (
    ADVENTURE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'Draft'
  )
}

export function adventureStatusBadgeVariant(
  status: AdventureStatus | string,
): 'default' | 'success' | 'warning' | 'dm' {
  switch (status) {
    case 'ready':
      return 'success'
    case 'active':
      return 'dm'
    case 'archived':
      return 'default'
    default:
      return 'warning'
  }
}
