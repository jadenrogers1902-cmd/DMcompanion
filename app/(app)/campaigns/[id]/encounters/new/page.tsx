import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createEncounter } from '@/lib/actions/encounters'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { GameMap } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function NewEncounterPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: campaign }, { data: membership }, { data: maps }] =
    await Promise.all([
      supabase.from('campaigns').select('id, name').eq('id', id).single(),
      supabase
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', id)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('maps')
        .select('*')
        .eq('campaign_id', id)
        .order('created_at', { ascending: false }),
    ])

  if (!campaign) notFound()
  if (!membership) redirect('/dashboard')
  if (membership.role !== 'dm') redirect(`/campaigns/${id}/encounters`)

  const create = async (formData: FormData) => {
    'use server'
    await createEncounter(id, formData)
  }
  const mapList = (maps ?? []) as GameMap[]

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      <Link
        href={`/campaigns/${id}/encounters`}
        className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Encounters
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">New Encounter</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Create a manual combat tracker for {campaign.name}.
        </p>
      </div>

      <form action={create} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-5">
        <Input
          label="Encounter name"
          name="name"
          placeholder="Goblin Ambush"
          required
          autoFocus
        />
        <Select
          label="Linked map"
          name="map_id"
          hint="Optional. Lets you pull in tokens from the map."
          defaultValue=""
        >
          <option value="">No map</option>
          {mapList.map((map) => (
            <option key={map.id} value={map.id}>
              {map.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-3 pt-2">
          <Link href={`/campaigns/${id}/encounters`} className="flex-1">
            <Button type="button" variant="secondary" className="w-full">
              Cancel
            </Button>
          </Link>
          <Button type="submit" className="flex-1">
            Create
          </Button>
        </div>
      </form>
    </div>
  )
}
