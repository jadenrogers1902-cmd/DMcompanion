'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { register } from '@/lib/actions/auth'

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(register, { error: null })

  if (state.status === 'check-email') {
    return (
      <div className="moonlit-panel rounded-2xl p-6 text-center backdrop-blur-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-success/40 bg-success/10 text-success">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5A2.25 2.25 0 0119.5 19.5h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0l-7.5-4.615a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <h2 className="font-display text-2xl font-semibold text-content">Check your email</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          We sent a confirmation link to <strong className="text-content">{state.email}</strong>.
          Open it to verify your account and choose your theme.
        </p>
        <p className="mt-4 text-xs text-faint">The link may take a minute to arrive. Check your spam folder if you do not see it.</p>
        <Link href="/login" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-border-strong bg-control px-4 py-2 text-sm font-semibold text-content hover:bg-hover">
          Back to sign in
        </Link>
      </div>
    )
  }

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
