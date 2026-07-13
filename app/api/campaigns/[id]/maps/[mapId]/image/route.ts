import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  const admin = createAdminClient()
  if (!admin) {
    return new NextResponse('Map storage is not configured', { status: 503 })
  }

  // Membership is established above. Source map metadata is DM-only, so the
  // service client is used only after authorization and no source fields are
  // returned to the browser.
  const { data: map } = await admin
    .from('maps')
    .select('id,campaign_id,storage_path,created_at,is_active')
    .eq('id', mapId)
    .eq('campaign_id', id)
    .maybeSingle()

  // Players may load only the campaign's active live map. DMs retain access
  // to inactive maps for setup and preview workflows.
  if (!map?.storage_path || (membership.role !== 'dm' && !map.is_active)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const storageVersion = createHash('sha256').update(map.storage_path).digest('base64url')
  const etag = `W/"${storageVersion}"`
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

  const { data: file, error } = await admin.storage.from('maps').download(map.storage_path)
  if (error || !file) {
    return new NextResponse('Not found', { status: 404 })
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info('[live-map-image] served private map image', {
      campaignId: id,
      mapId,
      storagePath: map.storage_path,
      createdAt: map.created_at,
    })
  }

  return new NextResponse(file.stream(), {
    status: 200,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'Content-Length': String(file.size),
      'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
      ETag: etag,
      'Last-Modified': new Date(map.created_at).toUTCString(),
      Vary: 'Cookie',
    },
  })
}
