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
      <h2 className="mb-2 text-lg font-semibold text-zinc-100">Something went wrong</h2>
      <p className="mb-6 max-w-sm text-sm text-zinc-400">
        This part of the campaign failed to load. You can try again, or head back to your
        dashboard.
      </p>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => reset()}>
          Try again
        </Button>
        <Link
          href="/dashboard"
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  )
}
