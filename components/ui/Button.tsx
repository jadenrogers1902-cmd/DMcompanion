'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const variantClasses = {
  primary:
    'bg-accent text-on-accent hover:bg-accent-hover font-semibold shadow-[0_8px_24px_color-mix(in_srgb,var(--theme-accent)_14%,transparent)] disabled:opacity-50 disabled:shadow-none',
  secondary:
    'border border-border-strong bg-control text-content hover:border-accent/55 hover:bg-hover disabled:opacity-50',
  ghost:
    'text-muted hover:bg-hover hover:text-content disabled:opacity-50',
  danger:
    'border border-danger/45 bg-danger/10 text-danger hover:bg-danger/18 disabled:opacity-50',
}

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-5 py-2.5 text-base rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 transition-[color,background-color,border-color,box-shadow]
          disabled:cursor-not-allowed
          ${variantClasses[variant]} ${sizeClasses[size]} ${className}
        `.trim()}
        {...props}
      >
        {loading && (
          <svg
            className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
