import { type ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && (
        <div className="mb-4 text-accent-soft">{icon}</div>
      )}
      <h3 className="mb-1 text-base font-semibold text-content">{title}</h3>
      {description && (
        <p className="mb-6 max-w-sm text-sm leading-relaxed text-faint">{description}</p>
      )}
      {action}
    </div>
  )
}
