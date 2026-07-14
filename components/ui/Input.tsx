import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-muted"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            w-full rounded-lg border bg-control px-3 py-2 text-sm text-content
            placeholder:text-faint
            outline-none transition-[border-color,box-shadow,background-color]
            ${
              error
                ? 'border-danger/65 focus:border-danger focus:shadow-[0_0_0_3px_rgb(240_113_155/0.1)]'
                : 'border-border-strong focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-accent)_10%,transparent)]'
            }
            disabled:cursor-not-allowed disabled:opacity-50
            ${className}
          `.trim()}
          {...props}
        />
        {hint && !error && (
          <p className="text-xs text-faint">{hint}</p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    )
  },
)

Input.displayName = 'Input'

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-muted"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={`
            w-full resize-none rounded-lg border bg-control px-3 py-2 text-sm text-content
            placeholder:text-faint
            outline-none transition-[border-color,box-shadow,background-color]
            ${
              error
                ? 'border-danger/65 focus:border-danger focus:shadow-[0_0_0_3px_rgb(240_113_155/0.1)]'
                : 'border-border-strong focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-accent)_10%,transparent)]'
            }
            disabled:cursor-not-allowed disabled:opacity-50
            ${className}
          `.trim()}
          {...props}
        />
        {hint && !error && <p className="text-xs text-faint">{hint}</p>}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    )
  },
)

Textarea.displayName = 'Textarea'
