'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export type AuthFormState = {
  error: string | null
  status?: 'check-email'
  email?: string
}

export async function login(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard')
}

export async function register(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirm_password') as string
  const displayName = formData.get('display_name') as string

  if (!displayName || displayName.trim().length < 2) {
    return { error: 'Display name must be at least 2 characters.' }
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' }
  }

  const headerStore = await headers()
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  const requestOrigin = headerStore.get('origin')
  const siteUrl = configuredSiteUrl || requestOrigin || 'http://localhost:3000'
  const emailRedirectTo = new URL('/auth/callback?next=/dashboard', siteUrl).toString()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName.trim() },
      emailRedirectTo,
    },
  })

  if (error) {
    return { error: error.message }
  }

  // Confirmation-required projects return a user without a session. Keep the
  // visitor on the registration page with an explicit next step.
  if (!data.session) {
    return { error: null, status: 'check-email', email }
  }

  // Profiles are auto-created by the database trigger. The authenticated app
  // layout will require the first theme choice.
  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
