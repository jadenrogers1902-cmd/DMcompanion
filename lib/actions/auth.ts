'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AuthFormState = {
  error: string | null
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

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName.trim() },
    },
  })

  if (error) {
    return { error: error.message }
  }

  // Profile is auto-created by the database trigger
  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
