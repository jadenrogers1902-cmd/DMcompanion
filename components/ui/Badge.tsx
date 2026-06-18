import { type HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'dm' | 'player' | 'default' | 'success' | 'warning'
}

// Filled variants use soft two-stop gradients (blue / pink / orange family);
// `default` stays a flat tinted pill so neutral chips don't get noisy.
const variantClasses = {
  dm: 'pill-violet',
  player: 'pill-blue',
  default: 'bg-zinc-700/50 text-zinc-300 border border-zinc-700',
  success: 'pill-emerald',
  warning: 'pill-sunset',
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
