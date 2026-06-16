import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EncounterManager } from '@/components/encounters/EncounterManager'
import type {
  Character,
  Encounter,
  EncounterParticipantDmNote,
  EncounterParticipantWithConditions,
  GameMap,
  Token,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string; encounterId: string }>
}

export default async function EncounterPage({ params }: PageProps) {
  const { id, encounterId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: campaign }, { data: membership }, { data: encounter }] =
    await Promise.all([
      supabase.from('campaigns').select('id, name').eq('id', id).single(),
      supabase
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', id)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('encounters')
        .select('*')
        .eq('id', encounterId)
        .eq('campaign_id', id)
        .single(),
    ])

  if (!campaign || !encounter) notFound()
  if (!membership) redirect('/dashboard')

  const isDM = membership.role === 'dm'

  const [
    { data: participantsRaw },
    { data: mapsRaw },
    { data: charactersRaw },
    { data: tokensRaw },
    { data: notesRaw },
  ] = await Promise.all([
    supabase
      .from('encounter_participants')
      .select('*, encounter_conditions (*)')
      .eq('encounter_id', encounterId),
    supabase.from('maps').select('*').eq('campaign_id', id),
    isDM
      ? supabase.from('characters').select('*').eq('campaign_id', id)
      : Promise.resolve({ data: [] }),
    isDM
      ? supabase.from('tokens').select('*').eq('campaign_id', id)
      : Promise.resolve({ data: [] }),
    isDM
      ? supabase
          .from('encounter_participant_dm_notes')
          .select('*')
          .eq('campaign_id', id)
      : Promise.resolve({ data: [] }),
  ])

  const notes: Record<string, string> = {}
  ;((notesRaw ?? []) as EncounterParticipantDmNote[]).forEach((note) => {
    notes[note.participant_id] = note.content ?? ''
  })

  return (
    <div className={isDM ? 'mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8' : 'max-w-7xl mx-auto px-4 sm:px-6 py-6'}>
      <Link
        href={`/campaigns/${id}/encounters`}
        className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {campaign.name} encounters
      </Link>

      <EncounterManager
        campaignId={id}
        encounter={encounter as Encounter}
        participants={
          (participantsRaw ?? []) as unknown as EncounterParticipantWithConditions[]
        }
        dmNotes={notes}
        characters={(charactersRaw ?? []) as Character[]}
        maps={(mapsRaw ?? []) as GameMap[]}
        tokens={(tokensRaw ?? []) as Token[]}
        isDM={isDM}
      />
    </div>
  )
}
