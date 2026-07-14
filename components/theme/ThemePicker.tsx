'use client'

import { THEMES, type ThemeKey } from '@/lib/themes'

interface ThemePickerProps {
  selected: ThemeKey
  onSelect: (theme: ThemeKey) => void
  disabled?: boolean
  idPrefix: string
}

export function ThemePicker({ selected, onSelect, disabled = false, idPrefix }: ThemePickerProps) {
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Available themes</legend>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Available themes">
        {THEMES.map((theme) => {
          const checked = selected === theme.key
          const inputId = `${idPrefix}-${theme.key}`
          return (
            <label
              key={theme.key}
              htmlFor={inputId}
              className={`group relative cursor-pointer rounded-xl border p-3 transition-[border-color,background-color,box-shadow,transform] focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-canvas motion-safe:hover:-translate-y-0.5 ${
                checked
                  ? 'border-accent bg-accent/10 shadow-[0_10px_28px_color-mix(in_srgb,var(--theme-accent)_14%,transparent)]'
                  : 'border-border bg-panel hover:border-border-strong hover:bg-panel-raised'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                id={inputId}
                type="radio"
                name={`${idPrefix}-theme`}
                value={theme.key}
                checked={checked}
                onChange={() => onSelect(theme.key)}
                className="sr-only"
              />
              <div
                className="mb-3 flex h-16 overflow-hidden rounded-lg border border-black/15 shadow-inner"
                aria-hidden="true"
                style={{ backgroundColor: theme.preview[0] }}
              >
                <div className="w-1/4 border-r border-black/15" style={{ backgroundColor: theme.preview[1] }} />
                <div className="flex flex-1 flex-col justify-between p-2">
                  <div className="h-2 w-3/5 rounded-full" style={{ backgroundColor: theme.preview[3] }} />
                  <div className="flex items-end justify-between gap-2">
                    <div className="h-2 w-2/5 rounded-full opacity-70" style={{ backgroundColor: theme.preview[3] }} />
                    <div className="h-5 w-10 rounded" style={{ backgroundColor: theme.preview[2] }} />
                  </div>
                </div>
                <div className="w-2" style={{ backgroundColor: theme.preview[4] }} />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-content">{theme.name}</p>
                  <p className="mt-0.5 text-xs leading-5 text-faint">{theme.description}</p>
                </div>
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    checked ? 'border-accent bg-accent text-on-accent' : 'border-border-strong'
                  }`}
                >
                  {checked && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
              </div>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
