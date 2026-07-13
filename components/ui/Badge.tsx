import { type HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'dm' | 'player' | 'default' | 'success' | 'warning'
}

const variantClasses = {
  dm: 'border border-dm-only/45 bg-dm-only/12 text-dm-only',
  player: 'border border-player-safe/40 bg-player-safe/10 text-player-safe',
  default: 'border border-border bg-control/75 text-muted',
  success: 'border border-success/40 bg-success/10 text-success',
  warning: 'border border-warning/40 bg-warning/10 text-warning',
}

export function Badge({
  variant = 'default',
  children,
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
