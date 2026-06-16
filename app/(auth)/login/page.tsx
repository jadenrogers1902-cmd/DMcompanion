'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { login } from '@/lib/actions/auth'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, { error: null })

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-zinc-100 mb-1">Sign in</h2>
      <p className="text-sm text-zinc-500 mb-6">Welcome back, adventurer.</p>

      <form action={formAction} className="flex flex-col gap-4">
        {state.error && <Alert message={state.error} />}

        <Input
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <Input
          label="Password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />

        <Button type="submit" loading={pending} size="lg" className="w-full mt-2">
          Sign in
        </Button>
      </form>

      <p className="text-sm text-zinc-500 text-center mt-6">
        No account?{' '}
        <Link href="/register" className="text-amber-400 hover:text-amber-300">
          Create one
        </Link>
      </p>
    </div>
  )
}
