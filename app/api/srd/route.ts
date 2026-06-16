import { createClient } from '@/lib/supabase/server'
import {
  OPEN5E_API_BASE,
  SRD_DOCUMENT_SLUG,
  isSrdCategory,
  mapSrdResult,
  type SrdSearchResult,
} from '@/lib/srd/open5e'

// Proxy for the Open5e SRD lookup used by Adventure Maker token enrichment.
// Going through our own route keeps the provider call server-side (one place to
// pin licensing + caching), gates it behind an authenticated session, and lets
// Next's data cache dedupe identical SRD queries.

const MAX_RESULTS = 8
const MIN_QUERY = 2
const FETCH_TIMEOUT_MS = 8000
// Public, effectively immutable reference data — cache identical lookups a day.
const CACHE_SECONDS = 86400

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const category = (searchParams.get('category') ?? '').trim()
  const query = (searchParams.get('q') ?? '').trim()

  if (!isSrdCategory(category)) {
    return Response.json({ error: 'Unknown resource category.' }, { status: 400 })
  }
  if (query.length < MIN_QUERY) {
    return Response.json(
      { error: `Enter at least ${MIN_QUERY} characters to search.` },
      { status: 400 },
    )
  }

  const url =
    `${OPEN5E_API_BASE}/${category}/?search=${encodeURIComponent(query)}` +
    `&document__slug=${SRD_DOCUMENT_SLUG}&limit=${MAX_RESULTS}&format=json`

  let payload: { results?: unknown[] }
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) {
      return Response.json(
        { error: `SRD provider returned ${res.status}.` },
        { status: 502 },
      )
    }
    payload = (await res.json()) as { results?: unknown[] }
  } catch {
    return Response.json({ error: 'SRD lookup failed. Try again.' }, { status: 502 })
  }

  const results: SrdSearchResult[] = Array.isArray(payload.results)
    ? payload.results
        .map((raw) => mapSrdResult(category, (raw ?? {}) as Record<string, unknown>))
        .filter((result): result is SrdSearchResult => result !== null)
    : []

  return Response.json({ results })
}
