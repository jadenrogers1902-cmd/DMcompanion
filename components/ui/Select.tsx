import { type SelectHTMLAttributes, forwardRef } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, className = '', id, children, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-muted">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`
            w-full rounded-lg border border-border-strong bg-control px-3 py-2 text-sm text-content
            outline-none transition-[border-color,box-shadow,background-color]
            focus:border-accent focus:shadow-[0_0_0_3px_rgb(184_167_255/0.1)]
            disabled:cursor-not-allowed disabled:opacity-50 ${className}
          `.trim()}
          {...props}
        >
          {children}
        </select>
        {hint && <p className="text-xs text-faint">{hint}</p>}
      </div>
    )
  },
)

Select.displayName = 'Select'
