'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'

export default function CampaignError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Campaign route error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <h2 className="font-display mb-2 text-2xl font-semibold text-content">Something went wrong</h2>
      <p className="mb-6 max-w-sm text-sm leading-relaxed text-muted">
        This part of the campaign failed to load. You can try again, or head back to your
        dashboard.
      </p>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => reset()}>
          Try again
        </Button>
        <Link
          href="/dashboard"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-[0_8px_24px_rgb(184_167_255/0.14)] transition-colors hover:bg-accent-hover"
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  )
}
