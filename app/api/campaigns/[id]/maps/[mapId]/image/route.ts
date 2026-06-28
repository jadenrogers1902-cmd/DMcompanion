import { Buffer } from 'node:buffer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; mapId: string }> },
) {
  const { id, mapId } = await context.params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { data: map } = await supabase
    .from('maps')
    .select('id,campaign_id,storage_path,updated_at')
    .eq('id', mapId)
    .eq('campaign_id', id)
    .maybeSingle()

  if (!map?.storage_path) {
    return new NextResponse('Not found', { status: 404 })
  }

  const etag = `W/"${Buffer.from(`${map.storage_path}:${map.updated_at}`).toString('base64url')}"`
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
        Vary: 'Cookie',
      },
    })
  }

  const { data: file, error } = await supabase.storage.from('maps').download(map.storage_path)
  if (error || !file) {
    return new NextResponse('Not found', { status: 404 })
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info('[live-map-image] served private map image', {
      campaignId: id,
      mapId,
      storagePath: map.storage_path,
      updatedAt: map.updated_at,
    })
  }

  return new NextResponse(file.stream(), {
    status: 200,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'Content-Length': String(file.size),
      'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
      ETag: etag,
      'Last-Modified': new Date(map.updated_at).toUTCString(),
      Vary: 'Cookie',
    },
  })
}
