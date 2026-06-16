import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { getServiceRoleConfig } from './env'

/**
 * Service-role Supabase client. Bypasses RLS and is for SERVER-ONLY use inside
 * server actions / route handlers that have already authorized the caller.
 *
 * Only ever import this from `'use server'` modules so it is never bundled into
 * client code; the service-role key has no NEXT_PUBLIC_ prefix and is never sent
 * to the browser. Returns null when SUPABASE_SERVICE_ROLE_KEY is unset so callers
 * can surface a clean "not configured" message rather than crashing.
 *
 * Never pass data read with this client back to the browser without explicitly
 * stripping secrets — it can read columns RLS would otherwise hide.
 */
export function createAdminClient() {
  const config = getServiceRoleConfig()
  if (!config) return null
  return createSupabaseClient<Database>(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
