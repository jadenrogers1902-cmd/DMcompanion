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
    <div className="moonlit-panel rounded-2xl p-6 backdrop-blur-xl">
      <h2 className="font-display mb-1 text-2xl font-semibold text-content">Create account</h2>
      <p className="mb-6 text-sm text-faint">Join the adventure.</p>

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

      <p className="mt-6 text-center text-sm text-faint">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
          Sign in
        </Link>
      </p>
    </div>
  )
}
