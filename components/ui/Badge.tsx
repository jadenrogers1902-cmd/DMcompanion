import { type HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'dm' | 'player' | 'default' | 'success' | 'warning'
}

const variantClasses = {
  dm: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  player: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  default: 'bg-zinc-700/50 text-zinc-400 border border-zinc-700',
  success: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  warning: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
}

export function Badge({
  variant = 'default',
  children,
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
