import { type HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'xs' | 'sm' | 'md' | 'lg' | 'none'
  tone?: 'default' | 'panel' | 'subtle'
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
  default: 'bg-zinc-900 border border-zinc-800',
  panel: 'bg-zinc-900 border border-zinc-800',
  subtle: 'bg-zinc-950 border border-zinc-800',
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
    <h2 className={`text-lg font-semibold text-zinc-100 ${className}`}>
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
    <p className={`text-[11px] font-semibold uppercase tracking-wide text-zinc-500 ${className}`}>
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
    <p className={`text-xs text-zinc-500 ${className}`}>
      {children}
    </p>
  )
}
