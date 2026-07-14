/**
 * Player-facing media may only load from this application or the configured
 * Supabase project. This prevents arbitrary remote URLs from becoming tracking
 * pixels while still allowing player-safe Storage assets and local artwork.
 */
export function safePlayerImageUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim()
  if (!candidate) return null

  if (candidate.startsWith('/')) {
    try {
      const appOrigin = 'https://player-media.invalid'
      const localUrl = new URL(candidate, appOrigin)
      if (localUrl.origin !== appOrigin) return null
      return `${localUrl.pathname}${localUrl.search}${localUrl.hash}`
    } catch {
      return null
    }
  }

  try {
    const url = new URL(candidate)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) return null
    const configuredOrigin = new URL(supabaseUrl)
    if (!['http:', 'https:'].includes(configuredOrigin.protocol)) return null

    return url.origin === configuredOrigin.origin ? url.toString() : null
  } catch {
    return null
  }
}

export function isPlayerImageMimeType(value: string | null | undefined): boolean {
  return Boolean(value?.toLowerCase().startsWith('image/'))
}
