'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { joinCampaign } from '@/lib/actions/campaigns'

export default function JoinPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await joinCampaign(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to campaigns
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100">Join a Campaign</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Enter the invite code your Dungeon Master gave you.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && <Alert message={error} />}

          <Input
            label="Invite code"
            name="invite_code"
            type="text"
            placeholder="e.g. AB3K9ZQR"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={8}
            required
            hint="Ask your DM for the 8-character invite code."
            className="font-mono text-lg tracking-widest uppercase"
          />

          <Button type="submit" loading={loading} size="lg" className="w-full">
            Join Campaign
          </Button>
        </form>
      </div>

      <p className="text-sm text-zinc-500 text-center mt-6">
        Want to run a campaign instead?{' '}
        <Link href="/campaigns/new" className="text-amber-400 hover:text-amber-300">
          Create one
        </Link>
      </p>
    </div>
  )
}
