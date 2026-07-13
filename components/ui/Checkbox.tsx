import { type InputHTMLAttributes, forwardRef } from 'react'

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', id, ...props }, ref) => {
    const inputId = id ?? `cb-${label.toLowerCase().replace(/\s+/g, '-')}`
    return (
      <label
        htmlFor={inputId}
        className="flex items-center gap-2.5 cursor-pointer select-none"
      >
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className={`
            h-4 w-4 cursor-pointer rounded border-border-strong bg-control text-accent
            accent-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}
          `.trim()}
          {...props}
        />
        <span className="text-sm text-muted">{label}</span>
      </label>
    )
  },
)

Checkbox.displayName = 'Checkbox'
