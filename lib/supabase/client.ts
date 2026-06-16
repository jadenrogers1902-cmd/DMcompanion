'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'
import { getSupabaseConfig } from './env'

export function createClient() {
  const { url, key } = getSupabaseConfig()

  return createBrowserClient<Database>(url, key)
}
