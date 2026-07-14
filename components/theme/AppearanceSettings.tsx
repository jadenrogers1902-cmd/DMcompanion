'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ThemePicker } from './ThemePicker'
import { useAccountTheme } from './ThemeProvider'
import { updateAccountTheme } from '@/lib/actions/theme'
import { THEME_BY_KEY } from '@/lib/themes'

export function AppearanceSettings() {
  const router = useRouter()
  const { theme, persistedTheme, previewTheme, acceptPersistedTheme, resetPreview } = useAccountTheme()
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; message: string } | null>(null)

  useEffect(() => resetPreview, [resetPreview])

  async function save() {
    setSaving(true)
    setNotice(null)
    const result = await updateAccountTheme({ themeKey: theme, completeOnboarding: false })
    setSaving(false)
    if (!result.ok) {
      setNotice({ kind: 'error', message: result.error })
      return
    }
    acceptPersistedTheme(result.themeKey)
    setNotice({ kind: 'success', message: `${THEME_BY_KEY[result.themeKey].name} saved.` })
    router.refresh()
  }

  return (
    <section className="rounded-2xl border border-border bg-panel p-5 shadow-sm sm:p-6" aria-labelledby="appearance-title">
      <div className="mb-5">
        <h2 id="appearance-title" className="text-xl font-semibold text-content">Appearance</h2>
        <p className="mt-1 text-sm text-muted">Your choice applies to both DM and player views on every device.</p>
      </div>

      <ThemePicker selected={theme} onSelect={(next) => { previewTheme(next); setNotice(null) }} disabled={saving} idPrefix="settings" />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="button" loading={saving} disabled={theme === persistedTheme} onClick={save}>
          Save Theme
        </Button>
        {theme !== persistedTheme && (
          <Button type="button" variant="ghost" disabled={saving} onClick={() => { resetPreview(); setNotice(null) }}>
            Cancel preview
          </Button>
        )}
      </div>
      {notice && <div className="mt-4"><Alert variant={notice.kind} message={notice.message} /></div>}
    </section>
  )
}
