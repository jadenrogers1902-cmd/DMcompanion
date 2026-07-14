'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { login } from '@/lib/actions/auth'

export function LoginForm({ confirmationMessage }: { confirmationMessage: string | null }) {
  const [state, formAction, pending] = useActionState(login, { error: null })

  return (
    <div className="moonlit-panel rounded-2xl p-6 backdrop-blur-xl">
      <h2 className="font-display mb-1 text-2xl font-semibold text-content">Sign in</h2>
      <p className="mb-6 text-sm text-faint">Welcome back, adventurer.</p>

      <form action={formAction} className="flex flex-col gap-4">
        {state.error && <Alert message={state.error} />}
        {confirmationMessage && <Alert message={confirmationMessage} />}

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

      <p className="mt-6 text-center text-sm text-faint">
        No account?{' '}
        <Link href="/register" className="font-medium text-accent hover:text-accent-hover">
          Create one
        </Link>
      </p>
    </div>
  )
}
