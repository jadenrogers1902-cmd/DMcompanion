'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeRefresh } from '@/lib/hooks/useRealtimeRefresh'
import { createClient } from '@/lib/supabase/client'
import { Tabs } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardEyebrow, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Checkbox } from '@/components/ui/Checkbox'
import {
  createHandoutRecord,
  createLocation,
  createNpc,
  createQuest,
  createSessionRecap,
  createStoryNote,
  deleteHandout,
  deleteLocation,
  deleteNpc,
  deleteQuest,
  deleteSessionRecap,
  deleteStoryNote,
  setHandoutRevealed,
  setLocationVisibility,
  setNoteVisibility,
  setNpcVisibility,
  setQuestVisibility,
  setSessionRecapVisibility,
} from '@/lib/actions/story'
import type {
  GameMap,
  HandoutWithUrl,
  Npc,
  Quest,
  SessionRecap,
  StoryLocation,
  StoryNote,
} from '@/lib/types/database'

interface StoryWorkspaceProps {
  campaignId: string
  isDM: boolean
  quests: Quest[]
  npcs: Npc[]
  locations: StoryLocation[]
  notes: StoryNote[]
  handouts: HandoutWithUrl[]
  recaps: SessionRecap[]
  maps: Pick<GameMap, 'id' | 'name'>[]
}

type Result = { success?: boolean; error?: string }

const MAX_HANDOUT_BYTES = 15 * 1024 * 1024
const HANDOUT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
]

function visibilityBadge(visible: boolean, visibleText = 'Visible') {
  return visible ? (
    <Badge variant="success">{visibleText}</Badge>
  ) : (
    <Badge variant="warning">Hidden</Badge>
  )
}

function noteBadge(visibility: string) {
  return visibility === 'shared' ? (
    <Badge variant="success">Shared</Badge>
  ) : (
    <Badge variant="dm">DM only</Badge>
  )
}

function snippet(value: string | null | undefined) {
  if (!value) return <span className="text-zinc-600">No notes yet.</span>
  return value
}

function formatBytes(bytes: number | null) {
  if (!bytes) return 'File'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function StoryWorkspace(props: StoryWorkspaceProps) {
  // Live sync: quest/NPC/location/note/handout/recap reveals and edits should
  // reach the party journal (and the DM's own other sessions/devices) live.
  // RLS scopes what each subscriber actually receives — players are only
  // notified about rows their SELECT policy already allows them to read.
  useRealtimeRefresh(`story-${props.campaignId}`, [
    { table: 'quests', filter: `campaign_id=eq.${props.campaignId}` },
    { table: 'npcs', filter: `campaign_id=eq.${props.campaignId}` },
    { table: 'locations', filter: `campaign_id=eq.${props.campaignId}` },
    { table: 'notes', filter: `campaign_id=eq.${props.campaignId}` },
    { table: 'handouts', filter: `campaign_id=eq.${props.campaignId}` },
    { table: 'session_recaps', filter: `campaign_id=eq.${props.campaignId}` },
  ])

  return props.isDM ? <DMStoryWorkspace {...props} /> : <PlayerJournal {...props} />
}

function DMStoryWorkspace({
  campaignId,
  quests,
  npcs,
  locations,
  notes,
  handouts,
  recaps,
  maps,
}: StoryWorkspaceProps) {
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    function matches(values: Array<string | null | undefined>) {
      if (!q) return true
      return values.some((value) => value?.toLowerCase().includes(q))
    }

    return {
      quests: quests.filter((item) =>
        matches([item.title, item.description, item.player_visible_description, item.dm_notes]),
      ),
      npcs: npcs.filter((item) =>
        matches([item.name, item.role, item.relationship_to_party, item.player_visible_notes, item.dm_notes]),
      ),
      locations: locations.filter((item) =>
        matches([item.name, item.description, item.player_visible_notes, item.dm_notes]),
      ),
      notes: notes.filter((item) => matches([item.title, item.content])),
      handouts: handouts.filter((item) => matches([item.title, item.description, item.file_type])),
      recaps: recaps.filter((item) =>
        matches([
          item.session_title,
          item.what_happened,
          item.important_npcs,
          item.locations_visited,
          item.quest_updates,
          item.dm_follow_up_notes,
        ]),
      ),
    }
  }, [handouts, locations, notes, npcs, q, quests, recaps])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Story Tools</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Manage quests, NPCs, locations, notes, handouts, and recaps for the campaign.
          </p>
        </div>
        <div className="w-full sm:w-80">
          <Input
            label="Search story"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Quest, NPC, place, clue..."
          />
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'quests', label: 'Quests', badge: quests.length, content: <QuestTab campaignId={campaignId} quests={filtered.quests} /> },
          { id: 'npcs', label: 'NPCs', badge: npcs.length, content: <NpcTab campaignId={campaignId} npcs={filtered.npcs} locations={locations} /> },
          { id: 'locations', label: 'Locations', badge: locations.length, content: <LocationTab campaignId={campaignId} locations={filtered.locations} maps={maps} /> },
          { id: 'notes', label: 'Notes', badge: notes.length, content: <NotesTab campaignId={campaignId} notes={filtered.notes} quests={quests} npcs={npcs} locations={locations} maps={maps} /> },
          { id: 'handouts', label: 'Handouts', badge: handouts.length, content: <HandoutsTab campaignId={campaignId} handouts={filtered.handouts} /> },
          { id: 'recaps', label: 'Recaps', badge: recaps.length, content: <RecapsTab campaignId={campaignId} recaps={filtered.recaps} /> },
        ]}
      />
    </div>
  )
}

function PlayerJournal({ quests, npcs, locations, notes, handouts, recaps }: StoryWorkspaceProps) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <CardEyebrow>Journal</CardEyebrow>
        <h1 className="text-2xl font-bold text-zinc-100">Party Journal</h1>
        <CardDescription className="mt-1 text-sm">
          Shared campaign notes, discoveries, handouts, and session recaps.
        </CardDescription>
      </div>

      <Tabs
        tabs={[
          { id: 'quests', label: 'Quests', badge: quests.length, content: <PlayerCards items={quests} render={(quest) => (
            <JournalCard title={quest.title} badge={<Badge variant="default">{quest.status}</Badge>}>
              <p>{snippet(quest.player_visible_description)}</p>
              {quest.rewards && <p className="mt-2 text-amber-200">Rewards: {quest.rewards}</p>}
            </JournalCard>
          )} /> },
          { id: 'npcs', label: 'NPCs', badge: npcs.length, content: <PlayerCards items={npcs} render={(npc) => (
            <JournalCard title={npc.name} badge={npc.role ? <Badge variant="default">{npc.role}</Badge> : null}>
              {npc.relationship_to_party && <p className="mb-2 text-zinc-400">{npc.relationship_to_party}</p>}
              <p>{snippet(npc.player_visible_notes)}</p>
            </JournalCard>
          )} /> },
          { id: 'locations', label: 'Locations', badge: locations.length, content: <PlayerCards items={locations} render={(location) => (
            <JournalCard title={location.name}>
              {location.description && <p className="mb-2 text-zinc-400">{location.description}</p>}
              <p>{snippet(location.player_visible_notes)}</p>
            </JournalCard>
          )} /> },
          { id: 'notes', label: 'Notes', badge: notes.length, content: <PlayerCards items={notes} render={(note) => (
            <JournalCard title={note.title}>
              <p>{snippet(note.content)}</p>
            </JournalCard>
          )} /> },
          { id: 'handouts', label: 'Handouts', badge: handouts.length, content: <PlayerCards items={handouts} render={(handout) => (
            <JournalCard title={handout.title} badge={<Badge variant="success">Revealed</Badge>}>
              <p>{snippet(handout.description)}</p>
              {handout.signed_url && (
                <a
                  href={handout.signed_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm font-medium text-amber-400 hover:text-amber-300"
                >
                  Open handout
                </a>
              )}
            </JournalCard>
          )} /> },
          { id: 'recaps', label: 'Recaps', badge: recaps.length, content: <PlayerCards items={recaps} render={(recap) => (
            <JournalCard title={recap.session_title} badge={recap.session_date ? <Badge variant="default">{recap.session_date}</Badge> : null}>
              <RecapBody recap={recap} includeDmNotes={false} />
            </JournalCard>
          )} /> },
        ]}
      />
    </div>
  )
}

function PlayerCards<T extends { id: string }>({
  items,
  render,
}: {
  items: T[]
  render: (item: T) => React.ReactNode
}) {
  if (items.length === 0) {
    return (
      <Card className="border-dashed">
        <p className="text-sm text-zinc-500">Nothing has been shared here yet.</p>
      </Card>
    )
  }
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{items.map(render)}</div>
}

function JournalCard({
  title,
  badge,
  children,
}: {
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card tone="panel">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
        {badge}
      </div>
      <div className="mt-3 text-sm text-zinc-500 whitespace-pre-wrap">{children}</div>
    </Card>
  )
}

function QuestTab({ campaignId, quests }: { campaignId: string; quests: Quest[] }) {
  return (
    <TwoColumn
      form={<StoryForm action={(formData) => createQuest(campaignId, formData)}>
        <Input name="title" label="Quest title" required />
        <Select name="status" label="Status" defaultValue="active">
          <option value="active">Active</option>
          <option value="hidden">Hidden</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </Select>
        <Textarea name="description" label="DM description" rows={3} />
        <Textarea name="player_visible_description" label="Player description" rows={3} />
        <Textarea name="rewards" label="Rewards" rows={2} />
        <Textarea name="dm_notes" label="DM notes" rows={3} />
        <Checkbox name="visible_to_players" label="Visible to players" />
      </StoryForm>}
      list={quests.length === 0 ? <EmptyList label="No quests yet." /> : quests.map((quest) => (
        <Card key={quest.id}>
          <CardHeader className="mb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{quest.title}</CardTitle>
                <p className="text-xs text-zinc-500 mt-1">{quest.status}</p>
              </div>
              {visibilityBadge(quest.visible_to_players)}
            </div>
          </CardHeader>
          <StoryText label="Players see" value={quest.player_visible_description} />
          <StoryText label="DM notes" value={quest.dm_notes} privateText />
          <div className="mt-4 flex flex-wrap gap-2">
            <QuickButton action={() => setQuestVisibility(campaignId, quest.id, !quest.visible_to_players)}>
              {quest.visible_to_players ? 'Hide' : 'Reveal'}
            </QuickButton>
            <DangerButton
              action={() => deleteQuest(campaignId, quest.id)}
              confirmMessage={`Delete quest "${quest.title}"? This cannot be undone.`}
            />
          </div>
        </Card>
      ))}
    />
  )
}

function NpcTab({
  campaignId,
  npcs,
  locations,
}: {
  campaignId: string
  npcs: Npc[]
  locations: StoryLocation[]
}) {
  return (
    <TwoColumn
      form={<StoryForm action={(formData) => createNpc(campaignId, formData)}>
        <Input name="name" label="NPC name" required />
        <Input name="role" label="Role" placeholder="Guard captain, rival, merchant..." />
        <Select name="location_id" label="Location" defaultValue="">
          <option value="">No linked location</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </Select>
        <Input name="relationship_to_party" label="Relationship to party" />
        <Input name="portrait_url" label="Portrait URL" />
        <Textarea name="player_visible_notes" label="Player notes" rows={3} />
        <Textarea name="dm_notes" label="DM notes" rows={3} />
        <Checkbox name="visible_to_players" label="Visible to players" />
      </StoryForm>}
      list={npcs.length === 0 ? <EmptyList label="No NPCs yet." /> : npcs.map((npc) => (
        <Card key={npc.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{npc.name}</CardTitle>
              {npc.role && <p className="text-xs text-zinc-500 mt-1">{npc.role}</p>}
            </div>
            {visibilityBadge(npc.visible_to_players)}
          </div>
          <StoryText label="Players know" value={npc.player_visible_notes} />
          <StoryText label="DM notes" value={npc.dm_notes} privateText />
          <div className="mt-4 flex flex-wrap gap-2">
            <QuickButton action={() => setNpcVisibility(campaignId, npc.id, !npc.visible_to_players)}>
              {npc.visible_to_players ? 'Hide' : 'Reveal'}
            </QuickButton>
            <DangerButton
              action={() => deleteNpc(campaignId, npc.id)}
              confirmMessage={`Delete NPC "${npc.name}"? This cannot be undone.`}
            />
          </div>
        </Card>
      ))}
    />
  )
}

function LocationTab({
  campaignId,
  locations,
  maps,
}: {
  campaignId: string
  locations: StoryLocation[]
  maps: Pick<GameMap, 'id' | 'name'>[]
}) {
  return (
    <TwoColumn
      form={<StoryForm action={(formData) => createLocation(campaignId, formData)}>
        <Input name="name" label="Location name" required />
        <Select name="map_id" label="Linked map" defaultValue="">
          <option value="">No linked map</option>
          {maps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
        </Select>
        <Textarea name="description" label="Description" rows={3} />
        <Textarea name="player_visible_notes" label="Player notes" rows={3} />
        <Textarea name="dm_notes" label="DM notes" rows={3} />
        <Checkbox name="visible_to_players" label="Visible to players" />
      </StoryForm>}
      list={locations.length === 0 ? <EmptyList label="No locations yet." /> : locations.map((location) => (
        <Card key={location.id}>
          <div className="flex items-start justify-between gap-3">
            <CardTitle>{location.name}</CardTitle>
            {visibilityBadge(location.visible_to_players)}
          </div>
          <StoryText label="Description" value={location.description} />
          <StoryText label="Players know" value={location.player_visible_notes} />
          <StoryText label="DM notes" value={location.dm_notes} privateText />
          <div className="mt-4 flex flex-wrap gap-2">
            <QuickButton action={() => setLocationVisibility(campaignId, location.id, !location.visible_to_players)}>
              {location.visible_to_players ? 'Hide' : 'Reveal'}
            </QuickButton>
            <DangerButton
              action={() => deleteLocation(campaignId, location.id)}
              confirmMessage={`Delete location "${location.name}"? This cannot be undone.`}
            />
          </div>
        </Card>
      ))}
    />
  )
}

function NotesTab({
  campaignId,
  notes,
  quests,
  npcs,
  locations,
  maps,
}: {
  campaignId: string
  notes: StoryNote[]
  quests: Quest[]
  npcs: Npc[]
  locations: StoryLocation[]
  maps: Pick<GameMap, 'id' | 'name'>[]
}) {
  return (
    <TwoColumn
      form={<StoryForm action={(formData) => createStoryNote(campaignId, formData)}>
        <Input name="title" label="Note title" required />
        <Select name="visibility" label="Visibility" defaultValue="dm">
          <option value="dm">DM only</option>
          <option value="shared">Shared with players</option>
        </Select>
        <Textarea name="content" label="Content" rows={5} />
        <Select name="quest_id" label="Linked quest" defaultValue="">
          <option value="">No quest</option>
          {quests.map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}
        </Select>
        <Select name="npc_id" label="Linked NPC" defaultValue="">
          <option value="">No NPC</option>
          {npcs.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}
        </Select>
        <Select name="location_id" label="Linked location" defaultValue="">
          <option value="">No location</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </Select>
        <Select name="map_id" label="Linked map" defaultValue="">
          <option value="">No map</option>
          {maps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
        </Select>
      </StoryForm>}
      list={notes.length === 0 ? <EmptyList label="No notes yet." /> : notes.map((note) => (
        <Card key={note.id}>
          <div className="flex items-start justify-between gap-3">
            <CardTitle>{note.title}</CardTitle>
            {noteBadge(note.visibility)}
          </div>
          <StoryText label="Content" value={note.content} />
          <div className="mt-4 flex flex-wrap gap-2">
            <QuickButton action={() => setNoteVisibility(campaignId, note.id, note.visibility === 'shared' ? 'dm' : 'shared')}>
              {note.visibility === 'shared' ? 'Make private' : 'Share'}
            </QuickButton>
            <DangerButton
              action={() => deleteStoryNote(campaignId, note.id)}
              confirmMessage={`Delete note "${note.title}"? This cannot be undone.`}
            />
          </div>
        </Card>
      ))}
    />
  )
}

function HandoutsTab({ campaignId, handouts }: { campaignId: string; handouts: HandoutWithUrl[] }) {
  return (
    <TwoColumn
      form={<HandoutUploader campaignId={campaignId} />}
      list={handouts.length === 0 ? <EmptyList label="No handouts uploaded yet." /> : handouts.map((handout) => (
        <Card key={handout.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{handout.title}</CardTitle>
              <p className="text-xs text-zinc-500 mt-1">{formatBytes(handout.file_size)}</p>
            </div>
            {handout.is_revealed ? <Badge variant="success">Revealed</Badge> : <Badge variant="warning">Hidden</Badge>}
          </div>
          <StoryText label="Description" value={handout.description} />
          {handout.signed_url && (
            <a
              href={handout.signed_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-sm font-medium text-amber-400 hover:text-amber-300"
            >
              Open file
            </a>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <QuickButton action={() => setHandoutRevealed(campaignId, handout.id, !handout.is_revealed)}>
              {handout.is_revealed ? 'Hide' : 'Reveal'}
            </QuickButton>
            <DangerButton
              action={() => deleteHandout(campaignId, handout.id)}
              confirmMessage={`Delete handout "${handout.title}" and its file? This cannot be undone.`}
            />
          </div>
        </Card>
      ))}
    />
  )
}

function RecapsTab({ campaignId, recaps }: { campaignId: string; recaps: SessionRecap[] }) {
  return (
    <TwoColumn
      form={<StoryForm action={(formData) => createSessionRecap(campaignId, formData)}>
        <Input name="session_title" label="Session title" required />
        <Input name="session_date" label="Session date" type="date" />
        <Textarea name="what_happened" label="What happened" rows={4} />
        <Textarea name="important_npcs" label="Important NPCs met" rows={2} />
        <Textarea name="locations_visited" label="Locations visited" rows={2} />
        <Textarea name="loot_gained" label="Loot gained" rows={2} />
        <Textarea name="quest_updates" label="Quest updates" rows={3} />
        <Textarea name="open_threads" label="Open threads" rows={3} />
        <Textarea name="next_session_start" label="Next session starting point" rows={2} />
        <Textarea name="dm_follow_up_notes" label="DM-only follow-up notes" rows={3} />
        <Checkbox name="visible_to_players" label="Visible to players" />
      </StoryForm>}
      list={recaps.length === 0 ? <EmptyList label="No session recaps yet." /> : recaps.map((recap) => (
        <Card key={recap.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{recap.session_title}</CardTitle>
              {recap.session_date && <p className="text-xs text-zinc-500 mt-1">{recap.session_date}</p>}
            </div>
            {visibilityBadge(recap.visible_to_players, 'Shared')}
          </div>
          <RecapBody recap={recap} includeDmNotes />
          <div className="mt-4 flex flex-wrap gap-2">
            <QuickButton action={() => setSessionRecapVisibility(campaignId, recap.id, !recap.visible_to_players)}>
              {recap.visible_to_players ? 'Hide' : 'Share'}
            </QuickButton>
            <DangerButton
              action={() => deleteSessionRecap(campaignId, recap.id)}
              confirmMessage={`Delete recap "${recap.session_title}"? This cannot be undone.`}
            />
          </div>
        </Card>
      ))}
    />
  )
}

function RecapBody({ recap, includeDmNotes }: { recap: SessionRecap; includeDmNotes: boolean }) {
  return (
    <div className="mt-3 grid gap-3 text-sm text-zinc-500">
      <StoryText label="What happened" value={recap.what_happened} />
      <StoryText label="Important NPCs" value={recap.important_npcs} />
      <StoryText label="Locations visited" value={recap.locations_visited} />
      <StoryText label="Loot gained" value={recap.loot_gained} />
      <StoryText label="Quest updates" value={recap.quest_updates} />
      <StoryText label="Open threads" value={recap.open_threads} />
      <StoryText label="Next session" value={recap.next_session_start} />
      {includeDmNotes && <StoryText label="DM follow-up" value={recap.dm_follow_up_notes} privateText />}
    </div>
  )
}

function StoryForm({
  action,
  children,
}: {
  action: (formData: FormData) => Promise<Result>
  children: React.ReactNode
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const result = await action(new FormData(e.currentTarget))
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    formRef.current?.reset()
    router.refresh()
  }

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      {children}
      <Button type="submit" loading={busy}>Create</Button>
    </form>
  )
}

function HandoutUploader({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function chooseFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const selected = e.target.files?.[0]
    if (!selected) return
    if (!HANDOUT_TYPES.includes(selected.type)) {
      setError('Choose an image, PDF, or plain text file.')
      return
    }
    if (selected.size > MAX_HANDOUT_BYTES) {
      setError('Handout is too large (max 15 MB).')
      return
    }
    setFile(selected)
    if (!title) setTitle(selected.name.replace(/\.[^.]+$/, ''))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    if (!title.trim()) {
      setError('Give the handout a title.')
      return
    }

    setBusy(true)
    setError(null)

    const supabase = createClient()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const path = `${campaignId}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('handouts')
      .upload(path, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      setError(uploadError.message)
      setBusy(false)
      return
    }

    const result = await createHandoutRecord(campaignId, {
      title,
      description,
      storage_path: path,
      file_type: file.type,
      file_size: file.size,
      is_revealed: revealed,
    })

    if (result?.error) {
      await supabase.storage.from('handouts').remove([path])
      setError(result.error)
      setBusy(false)
      return
    }

    setFile(null)
    setTitle('')
    setDescription('')
    setRevealed(false)
    setBusy(false)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      <label
        htmlFor="handout-file"
        className="rounded-lg border-2 border-dashed border-zinc-700 px-4 py-8 text-center text-sm text-zinc-400 hover:border-zinc-600 cursor-pointer"
      >
        {file ? file.name : 'Choose image, PDF, or text file'}
      </label>
      <input
        id="handout-file"
        type="file"
        accept={HANDOUT_TYPES.join(',')}
        onChange={chooseFile}
        className="hidden"
      />
      <Checkbox label="Reveal to players now" checked={revealed} onChange={(e) => setRevealed(e.target.checked)} />
      <Button type="submit" loading={busy} disabled={!file}>Upload handout</Button>
    </form>
  )
}

function TwoColumn({ form, list }: { form: React.ReactNode; list: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Create</CardTitle>
        </CardHeader>
        {form}
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{list}</div>
    </div>
  )
}

function StoryText({
  label,
  value,
  privateText = false,
}: {
  label: string
  value: string | null
  privateText?: boolean
}) {
  return (
    <div className="mt-3">
      <p className={`text-xs font-medium ${privateText ? 'text-amber-400' : 'text-zinc-400'}`}>
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-500">{snippet(value)}</p>
    </div>
  )
}

function EmptyList({ label }: { label: string }) {
  return (
    <Card className="border-dashed lg:col-span-2">
      <p className="text-sm text-zinc-500">{label}</p>
    </Card>
  )
}

function QuickButton({
  action,
  children,
}: {
  action: () => Promise<Result>
  children: React.ReactNode
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function click() {
    setBusy(true)
    await action()
    setBusy(false)
    router.refresh()
  }

  return (
    <Button type="button" variant="secondary" size="sm" loading={busy} onClick={click}>
      {children}
    </Button>
  )
}

function DangerButton({
  action,
  confirmMessage,
}: {
  action: () => Promise<Result>
  confirmMessage: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function click() {
    if (!window.confirm(confirmMessage)) return
    setBusy(true)
    await action()
    setBusy(false)
    router.refresh()
  }

  return (
    <Button type="button" variant="danger" size="sm" loading={busy} onClick={click}>
      Delete
    </Button>
  )
}
