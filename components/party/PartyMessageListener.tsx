'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { PartyMessage, PartyMessageType } from '@/lib/types/database'

type VisiblePartyMessage = PartyMessage & {
  senderName?: string
}

type MaybePartialPartyMessage = Omit<
  PartyMessage,
  'title' | 'sender_name' | 'recipient_ids' | 'dm_recipient_id' | 'visibility_level' | 'delivery_status' | 'delivery_log'
> &
  Partial<
    Pick<
      PartyMessage,
      'title' | 'sender_name' | 'recipient_ids' | 'dm_recipient_id' | 'visibility_level' | 'delivery_status' | 'delivery_log'
    >
  >

function campaignIdFromPath(pathname: string) {
  const match = pathname.match(/^\/campaigns\/([^/]+)/)
  return match?.[1] && match[1] !== 'new' ? match[1] : null
}

function titleFor(type: PartyMessageType) {
  if (type === 'meeting') return 'Party Meeting Called'
  if (type === 'announcement') return 'Party Announcement'
  if (type === 'nudge') return 'DM Action Nudge'
  if (type === 'codex_reveal') return 'New information revealed'
  return 'Private Whisper'
}

export function PartyMessageListener({ userId }: { userId: string }) {
  const pathname = usePathname()
  const campaignId = useMemo(() => campaignIdFromPath(pathname), [pathname])
  const [message, setMessage] = useState<VisiblePartyMessage | null>(null)
  const [isDM, setIsDM] = useState(false)
  const [dmPill, setDmPill] = useState<VisiblePartyMessage | null>(null)
  const [dmLog, setDmLog] = useState<VisiblePartyMessage[]>([])
  const [logOpen, setLogOpen] = useState(false)
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set())

  const hydrateAndShow = useCallback(async (raw: MaybePartialPartyMessage) => {
    if (seenIds.has(raw.id)) return
    if (raw.sender_user_id === userId && raw.message_type !== 'meeting') return
    const recipientIds = Array.isArray(raw.recipient_ids) ? raw.recipient_ids : []
    const supabase = createClient()
    const [{ data: profile }, { data: membership }] = await Promise.all([
      supabase
        .from('profiles')
        .select('display_name')
        .eq('id', raw.sender_user_id)
        .maybeSingle(),
      supabase
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', raw.campaign_id)
        .eq('user_id', userId)
        .maybeSingle(),
    ])

    const roleIsDM = membership?.role === 'dm'
    setIsDM(roleIsDM)
    setSeenIds((prev) => new Set(prev).add(raw.id))
    const hydrated = {
      ...raw,
      title: raw.title ?? titleFor(raw.message_type),
      sender_name: raw.sender_name ?? null,
      recipient_ids: recipientIds,
      dm_recipient_id: raw.dm_recipient_id ?? null,
      visibility_level: raw.visibility_level ?? (raw.message_type === 'nudge' ? 'dm_metadata' : 'players'),
      delivery_status: raw.delivery_status ?? 'sent',
      delivery_log: raw.delivery_log ?? {},
      senderName: raw.sender_name ?? profile?.display_name ?? 'A party member',
    } satisfies VisiblePartyMessage

    if (roleIsDM) {
      setDmPill(hydrated)
      setDmLog((prev) => [hydrated, ...prev.filter((item) => item.id !== hydrated.id)].slice(0, 10))
      window.setTimeout(() => {
        setDmPill((current) => (current?.id === hydrated.id ? null : current))
      }, 5500)
      return
    }

    if (raw.message_type === 'nudge') return

    const isRecipient =
      recipientIds.length === 0 ||
      recipientIds.includes(userId) ||
      raw.recipient_user_id === userId
    if (isRecipient) setMessage(hydrated)
  }, [seenIds, userId])

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let active = true

    async function subscribe() {
      const campaignIds = campaignId
        ? [campaignId]
        : ((await supabase
            .from('campaign_members')
            .select('campaign_id')
            .eq('user_id', userId)).data ?? [])
            .map((row) => row.campaign_id)

      if (!active || campaignIds.length === 0) return

      channel = supabase.channel(`party-messages-${userId}-${campaignIds.join('-')}`)
      campaignIds.forEach((id) => {
        channel = channel?.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'party_messages',
            filter: `campaign_id=eq.${id}`,
          },
          (payload) => {
            void hydrateAndShow(payload.new as MaybePartialPartyMessage)
          },
        ) ?? null
      })
      channel?.subscribe()
    }

    void subscribe()

    return () => {
      active = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [campaignId, hydrateAndShow, userId])

  if (!message && !dmPill && dmLog.length === 0) return null

  if (isDM) {
    return (
      <>
        {dmPill && (
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="fixed right-4 top-4 z-[65] max-w-sm rounded-full border border-zinc-700 bg-zinc-950/95 px-4 py-2 text-left shadow-2xl shadow-black/40 backdrop-blur transition hover:border-amber-500/50"
          >
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-zinc-100">{dmPill.title}</span>
                <span className="block truncate text-[11px] text-zinc-500">
                  {dmPill.message_type === 'whisper'
                    ? `${dmPill.senderName ?? 'Player'} ${dmPill.title.toLowerCase()}.`
                    : dmPill.message_type === 'nudge'
                      ? dmPill.message
                    : dmPill.message}
                </span>
              </span>
            </span>
          </button>
        )}
        {logOpen && (
          <div className="fixed right-4 top-16 z-[66] w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-100">Communication Log</h2>
              <button type="button" onClick={() => setLogOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-100">Close</button>
            </div>
            <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto">
              {dmLog.map((item) => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <p className="text-xs font-medium text-zinc-100">{item.title}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {item.message_type === 'whisper'
                      ? `${item.senderName ?? 'Player'} ${item.title.toLowerCase()}.`
                      : item.message_type === 'nudge'
                        ? item.message
                      : item.message}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-600">
                    {item.delivery_status} / {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  if (!message) return null

  const isMeeting = message.message_type === 'meeting'
  const isAnnouncement = message.message_type === 'announcement'
  const isReveal = message.message_type === 'codex_reveal'

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center px-4 pointer-events-none">
      <div
        className={`pointer-events-auto w-full ${
          isMeeting ? 'max-w-2xl border-red-500 bg-red-950 shadow-red-950/70' : 'max-w-md border-amber-500/50 bg-zinc-950 shadow-black/50'
        } rounded-xl border p-5 text-center shadow-2xl`}
        role="alertdialog"
        aria-modal="true"
      >
        <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${isMeeting ? 'text-red-200' : 'text-amber-300'}`}>
          {isMeeting ? 'Urgent Table Alert' : isAnnouncement ? 'Party Notice' : isReveal ? 'New Information' : 'Private Message'}
        </p>
        <h2 className={`mt-2 font-bold ${isMeeting ? 'text-3xl text-red-50' : 'text-xl text-zinc-100'}`}>
          {titleFor(message.message_type)}
        </h2>
        <p className="mt-2 text-sm text-zinc-300">
          {isReveal ? 'From your DM' : `From ${message.senderName ?? 'A party member'}`}
        </p>
        <p className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
          isMeeting ? 'border-red-400/40 bg-red-900/50 text-red-50' : 'border-zinc-700 bg-zinc-900 text-zinc-100'
        }`}>
          {message.message}
        </p>
        {isMeeting && (
          <p className="mt-3 text-base font-semibold text-red-100">
            Everyone should pause and listen.
          </p>
        )}
        {isReveal && (
          <p className="mt-3 text-xs text-zinc-500">
            Find the full details under Revealed Info in your campaign Codex.
          </p>
        )}
        <button
          type="button"
          onClick={() => setMessage(null)}
          className={`mt-5 rounded-md px-4 py-2 text-sm font-semibold transition ${
            isMeeting ? 'bg-red-100 text-red-950 hover:bg-white' : 'bg-amber-500 text-zinc-950 hover:bg-amber-400'
          }`}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
