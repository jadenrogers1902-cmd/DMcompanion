'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isThemeKey, THEME_COOKIE, type ThemeKey } from '@/lib/themes'

export type UpdateThemeResult =
  | { ok: true; themeKey: ThemeKey }
  | { ok: false; error: string }

export async function updateAccountTheme(input: {
  themeKey: ThemeKey
  completeOnboarding: boolean
}): Promise<UpdateThemeResult> {
  if (!isThemeKey(input.themeKey)) {
    return { ok: false, error: 'Choose one of the available themes.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false, error: 'Your session expired. Sign in and try again.' }
  }

  const update: {
    theme_key: ThemeKey
    theme_onboarding_completed_at?: string
  } = { theme_key: input.themeKey }

  if (input.completeOnboarding) {
    update.theme_onboarding_completed_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id)

  if (error) {
    return { ok: false, error: 'Could not save your theme. Please try again.' }
  }

  const cookieStore = await cookies()
  cookieStore.set(THEME_COOKIE, input.themeKey, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath('/settings')
  revalidatePath('/dashboard')
  return { ok: true, themeKey: input.themeKey }
}
