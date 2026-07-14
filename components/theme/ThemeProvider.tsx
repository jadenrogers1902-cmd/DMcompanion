'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { ThemePicker } from './ThemePicker'
import { updateAccountTheme } from '@/lib/actions/theme'
import { THEME_BY_KEY, type ThemeKey } from '@/lib/themes'

interface ThemeContextValue {
  theme: ThemeKey
  persistedTheme: ThemeKey
  previewTheme: (theme: ThemeKey) => void
  acceptPersistedTheme: (theme: ThemeKey) => void
  resetPreview: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useAccountTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useAccountTheme must be used inside ThemeProvider')
  return context
}

export function ThemeProvider({
  initialTheme,
  onboardingRequired,
  children,
}: {
  initialTheme: ThemeKey
  onboardingRequired: boolean
  children: ReactNode
}) {
  const [theme, setTheme] = useState(initialTheme)
  const [persistedTheme, setPersistedTheme] = useState(initialTheme)
  const persistedThemeRef = useRef(initialTheme)

  useEffect(() => {
    const definition = THEME_BY_KEY[theme]
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = definition.colorMode

    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = definition.colors.canvas
  }, [theme])

  const previewTheme = useCallback((nextTheme: ThemeKey) => setTheme(nextTheme), [])
  const acceptPersistedTheme = useCallback((nextTheme: ThemeKey) => {
    persistedThemeRef.current = nextTheme
    setTheme(nextTheme)
    setPersistedTheme(nextTheme)
  }, [])
  const resetPreview = useCallback(() => {
    setTheme(persistedThemeRef.current)
  }, [])

  const value: ThemeContextValue = {
    theme,
    persistedTheme,
    previewTheme,
    acceptPersistedTheme,
    resetPreview,
  }

  return (
    <ThemeContext.Provider value={value}>
      <div className="contents" data-theme={theme}>
        {children}
        {onboardingRequired && <ThemeOnboardingDialog />}
      </div>
    </ThemeContext.Provider>
  )
}

function ThemeOnboardingDialog() {
  const router = useRouter()
  const { theme, previewTheme, acceptPersistedTheme } = useAccountTheme()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const firstRadio = dialogRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')
    firstRadio?.focus()
  }, [])

  function containFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? [],
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  async function saveTheme() {
    setSaving(true)
    setError(null)
    const result = await updateAccountTheme({ themeKey: theme, completeOnboarding: true })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    acceptPersistedTheme(result.themeKey)
    setComplete(true)
    router.refresh()
  }

  if (complete) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-onboarding-title"
        aria-describedby="theme-onboarding-description"
        onKeyDown={containFocus}
        className="my-auto w-full max-w-3xl rounded-2xl border border-border-strong bg-overlay p-5 shadow-2xl sm:p-7"
      >
        <div className="mb-5 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">First adventure</p>
          <h2 id="theme-onboarding-title" className="font-display text-3xl font-semibold text-content">
            Choose Your Realm
          </h2>
          <p id="theme-onboarding-description" className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">
            Pick the colors that will follow your account through every campaign, whether you are playing or running the table.
          </p>
        </div>

        <ThemePicker selected={theme} onSelect={previewTheme} disabled={saving} idPrefix="onboarding" />

        <div className="mt-5 space-y-3">
          {error && <Alert message={error} />}
          <Button type="button" size="lg" loading={saving} onClick={saveTheme} className="w-full sm:w-auto sm:min-w-44">
            Enter the App
          </Button>
          <p className="text-xs text-faint">You can change this later in Account Settings.</p>
        </div>
      </div>
    </div>
  )
}
