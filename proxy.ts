import { createServerClient } from '@supabase/ssr'
import { getSupabaseConfig } from '@/lib/supabase/env'
import { NextResponse, type NextRequest } from 'next/server'

const AUTH_RESPONSE_HEADERS = ['cache-control', 'expires', 'pragma'] as const

function copyAuthState(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
  AUTH_RESPONSE_HEADERS.forEach((name) => {
    const value = source.headers.get(name)
    if (value) target.headers.set(name, value)
  })
  return target
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const { url, key } = getSupabaseConfig()

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
          Object.entries(headers).forEach(([name, value]) =>
            supabaseResponse.headers.set(name, value),
          )
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()
  const isAuthenticated = Boolean(data?.claims?.sub)

  const { pathname } = request.nextUrl

  const isAuthRoute =
    pathname.startsWith('/login') || pathname.startsWith('/register')
  const isAppRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/campaigns') ||
    pathname.startsWith('/join')

  // Redirect unauthenticated users away from app routes
  if (!isAuthenticated && isAppRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return copyAuthState(supabaseResponse, NextResponse.redirect(url))
  }

  // Redirect authenticated users away from auth routes
  if (isAuthenticated && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return copyAuthState(supabaseResponse, NextResponse.redirect(url))
  }

  // Redirect root to dashboard or login
  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = isAuthenticated ? '/dashboard' : '/login'
    return copyAuthState(supabaseResponse, NextResponse.redirect(url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/register',
    '/dashboard/:path*',
    '/campaigns/:path*',
    '/join/:path*',
  ],
}
