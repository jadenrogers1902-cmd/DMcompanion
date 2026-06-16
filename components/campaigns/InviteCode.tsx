'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { regenerateInviteCode } from '@/lib/actions/campaigns'

interface InviteCodeProps {
  campaignId: string
  initialCode: string
}

export function InviteCode({ campaignId, initialCode }: InviteCodeProps) {
  const [code, setCode] = useState(initialCode)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRegenerate() {
    setRegenerating(true)
    setError(null)
    const result = await regenerateInviteCode(campaignId)
    if (result.error) {
      setError(result.error)
    } else if (result.code) {
      setCode(result.code)
    }
    setRegenerating(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3">
          <span className="font-mono text-lg font-semibold text-amber-400 tracking-widest">
            {code}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>

      <p className="text-xs text-zinc-500">
        Share this code with players. They can use it at{' '}
        <span className="text-zinc-400 font-mono">/join</span>.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <Button
        variant="ghost"
        size="sm"
        onClick={handleRegenerate}
        loading={regenerating}
        className="self-start text-zinc-500"
      >
        Regenerate code
      </Button>
    </div>
  )
}
