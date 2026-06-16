'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { register } from '@/lib/actions/auth'

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(register, { error: null })

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-zinc-100 mb-1">Create account</h2>
      <p className="text-sm text-zinc-500 mb-6">Join the adventure.</p>

      <form action={formAction} className="flex flex-col gap-4">
        {state.error && <Alert message={state.error} />}

        <Input
          label="Display name"
          name="display_name"
          type="text"
          placeholder="Thorin Oakenshield"
          autoComplete="name"
          required
          hint="This is how others will see you."
        />
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
          autoComplete="new-password"
          required
          minLength={6}
          hint="At least 6 characters."
        />
        <Input
          label="Confirm password"
          name="confirm_password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          required
        />

        <Button type="submit" loading={pending} size="lg" className="w-full mt-2">
          Create account
        </Button>
      </form>

      <p className="text-sm text-zinc-500 text-center mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-amber-400 hover:text-amber-300">
          Sign in
        </Link>
      </p>
    </div>
  )
}
