import { type HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'xs' | 'sm' | 'md' | 'lg' | 'none'
  tone?: 'default' | 'panel' | 'subtle' | 'overlay' | 'interactive' | 'live' | 'dm' | 'player'
  rounded?: 'lg' | 'xl'
}

const paddingClasses = {
  none: '',
  xs: 'p-3',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
}

const toneClasses = {
  default: 'border border-border bg-panel shadow-[inset_0_1px_rgb(242_236_255/0.025)]',
  panel: 'border border-border bg-panel-raised/75 shadow-[inset_0_1px_rgb(242_236_255/0.025)]',
  subtle: 'border border-border bg-shell/90',
  overlay: 'border border-border-strong bg-overlay/95 shadow-2xl backdrop-blur-xl',
  interactive: 'border border-border bg-panel transition hover:border-accent/50 hover:bg-panel-raised',
  live: 'border border-live/45 bg-live/8',
  dm: 'border border-dm-only/40 bg-dm-only/8',
  player: 'border border-player-safe/40 bg-player-safe/8',
}

const roundedClasses = {
  lg: 'rounded-lg',
  xl: 'rounded-xl',
}

export function Card({
  children,
  padding = 'md',
  tone = 'default',
  rounded = 'xl',
  className = '',
  ...props
}: CardProps) {
  return (
    <div
      className={`${toneClasses[tone]} ${roundedClasses[rounded]} ${paddingClasses[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`mb-4 ${className}`}>
      {children}
    </div>
  )
}

export function CardTitle({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h2 className={`text-lg font-semibold text-content ${className}`}>
      {children}
    </h2>
  )
}

export function CardEyebrow({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] text-faint ${className}`}>
      {children}
    </p>
  )
}

export function CardDescription({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={`text-xs leading-relaxed text-faint ${className}`}>
      {children}
    </p>
  )
}
