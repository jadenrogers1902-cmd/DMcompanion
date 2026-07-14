import type { Metadata } from 'next'
import { AppearanceSettings } from '@/components/theme/AppearanceSettings'

export const metadata: Metadata = { title: 'Account Settings' }

export default function AccountSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Your account</p>
        <h1 className="mt-1 text-3xl font-semibold text-content">Account Settings</h1>
        <p className="mt-2 text-sm text-muted">Personal preferences that follow you between campaigns.</p>
      </div>
      <AppearanceSettings />
    </div>
  )
}
