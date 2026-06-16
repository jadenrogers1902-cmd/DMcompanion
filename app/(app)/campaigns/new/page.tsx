'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { createCampaign } from '@/lib/actions/campaigns'

export default function NewCampaignPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await createCampaign(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
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
        <h1 className="text-2xl font-bold text-zinc-100">New Campaign</h1>
        <p className="text-sm text-zinc-500 mt-1">
          You will be the Dungeon Master. An invite code will be generated automatically.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && <Alert message={error} />}

          <Input
            label="Campaign name"
            name="name"
            type="text"
            placeholder="The Lost Mines of Phandelver"
            required
            autoFocus
          />

          <Textarea
            label="Description"
            name="description"
            placeholder="A brief description of the campaign setting, tone, or hook..."
            rows={4}
            hint="Optional. Visible to players who join."
          />

          <div className="flex gap-3 pt-2">
            <Link href="/dashboard" className="flex-1">
              <Button variant="secondary" className="w-full" type="button">
                Cancel
              </Button>
            </Link>
            <Button type="submit" loading={loading} className="flex-1">
              Create Campaign
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
