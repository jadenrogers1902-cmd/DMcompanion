import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const [{ data: campaign }, { data: membership }] = await Promise.all([
    supabase.from('campaigns').select('*').eq('id', id).single(),
    supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', id)
      .eq('user_id', user.id)
      .single(),
  ])

  if (!campaign || !membership) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (membership.role !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can export campaign backups.' }, { status: 403 })
  }

  const childCharacterIds = await characterIds(supabase, id)
  const [
    { data: members },
    { data: characters },
    { data: inventory },
    { data: spells },
    { data: abilities },
    { data: characterConditions },
    { data: maps },
    { data: tokens },
    { data: encounters },
    { data: encounterParticipants },
    { data: encounterConditions },
    { data: actionIntents },
    { data: quests },
    { data: npcs },
    { data: locations },
    { data: notes },
    { data: handouts },
    { data: sessionRecaps },
  ] = await Promise.all([
    supabase.from('campaign_members').select('*').eq('campaign_id', id),
    supabase.from('characters').select('*').eq('campaign_id', id),
    supabase.from('character_inventory_items').select('*').in('character_id', childCharacterIds),
    supabase.from('character_spells').select('*').in('character_id', childCharacterIds),
    supabase.from('character_abilities').select('*').in('character_id', childCharacterIds),
    supabase.from('character_conditions').select('*').in('character_id', childCharacterIds),
    supabase.from('maps').select('id,campaign_id,name,storage_path,grid_enabled,grid_size,grid_scale_feet,grid_color,grid_opacity,grid_line_width,grid_subdivisions,grid_offset_x,grid_offset_y,dm_light_brightness,width,height,is_active,player_movement_locked,created_by,created_at,updated_at').eq('campaign_id', id),
    supabase.from('tokens').select('*').eq('campaign_id', id),
    supabase.from('encounters').select('*').eq('campaign_id', id),
    supabase.from('encounter_participants').select('*').eq('campaign_id', id),
    supabase.from('encounter_conditions').select('*').eq('campaign_id', id),
    supabase.from('action_intents').select('*').eq('campaign_id', id),
    supabase.from('quests').select('*').eq('campaign_id', id),
    supabase.from('npcs').select('*').eq('campaign_id', id),
    supabase.from('locations').select('*').eq('campaign_id', id),
    supabase.from('notes').select('*').eq('campaign_id', id),
    supabase.from('handouts').select('id,campaign_id,title,description,storage_path,file_type,file_size,is_revealed,quest_id,npc_id,location_id,session_recap_id,created_by,created_at,updated_at').eq('campaign_id', id),
    supabase.from('session_recaps').select('*').eq('campaign_id', id),
  ])

  const exportedAt = new Date().toISOString()
  const payload = {
    format: 'dm-companion-campaign-export',
    version: 1,
    exported_at: exportedAt,
    campaign,
    members: members ?? [],
    characters: characters ?? [],
    character_inventory_items: inventory ?? [],
    character_spells: spells ?? [],
    character_abilities: abilities ?? [],
    character_conditions: characterConditions ?? [],
    maps: maps ?? [],
    tokens: tokens ?? [],
    encounters: encounters ?? [],
    encounter_participants: encounterParticipants ?? [],
    encounter_conditions: encounterConditions ?? [],
    action_intents: actionIntents ?? [],
    quests: quests ?? [],
    npcs: npcs ?? [],
    locations: locations ?? [],
    notes: notes ?? [],
    handouts: handouts ?? [],
    session_recaps: sessionRecaps ?? [],
  }

  const safeName = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${safeName || 'campaign'}-backup-${exportedAt.slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  })
}

async function characterIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignId: string,
) {
  const { data } = await supabase.from('characters').select('id').eq('campaign_id', campaignId)
  const ids = (data ?? []).map((row) => row.id)
  return ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']
}
