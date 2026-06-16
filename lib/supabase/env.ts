export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    )
  }

  return { url, key }
}

/**
 * Server-only Supabase admin configuration. The service-role key bypasses RLS
 * and must NEVER be prefixed NEXT_PUBLIC_ or used in client code. Returns null
 * when unset so features that need it can degrade with a clean message instead
 * of crashing the app.
 */
export function getServiceRoleConfig(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return null
  // A common setup mistake is pasting the Notion integration token here. Treat
  // that as unconfigured so the UI points admins at the Supabase service role.
  if (serviceRoleKey.startsWith('ntn_') || serviceRoleKey.startsWith('secret_')) return null
  return { url, serviceRoleKey }
}
