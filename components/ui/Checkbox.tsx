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
            w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-amber-500
            accent-amber-500 cursor-pointer ${className}
          `.trim()}
          {...props}
        />
        <span className="text-sm text-zinc-300">{label}</span>
      </label>
    )
  },
)

Checkbox.displayName = 'Checkbox'
