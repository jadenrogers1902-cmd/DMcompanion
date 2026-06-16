'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { PartyMessageType } from '@/lib/types/database'

type DeliveryStatus = 'pending' | 'sent' | 'received' | 'failed'
type VisibilityLevel = 'players' | 'dm_metadata' | 'private'

interface DeliveryEnvelope {
  messageType: PartyMessageType
  title: string
  body: string
  recipientIds: string[]
  dmRecipientId: string | null
  visibilityLevel: VisibilityLevel
  deliveryStatus: DeliveryStatus
  recipientUserId?: string | null
  /** For nudges: the action_intent this nudge refers to, so the DM card can highlight. */
  intentId?: string | null
}

async function getClientAndUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

function cleanMessage(value: string, fallback: string) {
  const trimmed = value.trim()
  if (!trimmed) return fallback
  return trimmed.slice(0, 280)
}

async function getCampaignRecipients(campaignId: string, senderId: string) {
  const supabase = await createClient()
  const [{ data: members }, { data: senderProfile }] = await Promise.all([
    supabase
      .from('campaign_members')
      .select('user_id, role')
      .eq('campaign_id', campaignId),
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', senderId)
      .maybeSingle(),
  ])

  const rows = members ?? []
  const dm = rows.find((member) => member.role === 'dm') ?? null
  const players = rows.filter((member) => member.role !== 'dm')
  return {
    members: rows,
    playerIds: players.map((member) => member.user_id),
    dmRecipientId: dm?.user_id ?? null,
    senderName: senderProfile?.display_name ?? 'A party member',
  }
}

function notifyAllPlayers(
  messageType: PartyMessageType,
  title: string,
  body: string,
  recipientIds: string[],
  dmRecipientId: string | null,
): DeliveryEnvelope {
  return {
    messageType,
    title,
    body,
    recipientIds,
    dmRecipientId,
    visibilityLevel: 'players',
    deliveryStatus: 'sent',
    recipientUserId: null,
  }
}

function notifyPlayer(
  title: string,
  body: string,
  recipientId: string,
  dmRecipientId: string | null,
): DeliveryEnvelope {
  return {
    messageType: 'whisper',
    title,
    body,
    recipientIds: [recipientId],
    dmRecipientId,
    visibilityLevel: 'private',
    deliveryStatus: 'sent',
    recipientUserId: recipientId,
  }
}

function notifyDM(envelope: DeliveryEnvelope) {
  return {
    dmRecipientId: envelope.dmRecipientId,
    visibilityLevel: envelope.messageType === 'whisper' ? 'dm_metadata' : envelope.visibilityLevel,
  }
}

function logPartyMessage(envelope: DeliveryEnvelope, senderId: string, senderName: string) {
  return {
    messageId: crypto.randomUUID(),
    messageType: envelope.messageType,
    senderId,
    senderName,
    recipientIds: envelope.recipientIds,
    dmRecipientId: envelope.dmRecipientId,
    timestamp: new Date().toISOString(),
    title: envelope.title,
    body: envelope.messageType === 'whisper' ? 'Whisper content hidden from DM by default.' : envelope.body,
    visibilityLevel: envelope.visibilityLevel,
    deliveryStatus: envelope.deliveryStatus,
    // Links a nudge to its action card so the DM queue can highlight it. Null
    // for non-nudge messages. Stored in the existing delivery_log JSONB — no
    // schema change required.
    intentId: envelope.intentId ?? null,
  }
}

function rowForEnvelope(
  campaignId: string,
  envelope: DeliveryEnvelope,
  deliveryLog: ReturnType<typeof logPartyMessage>,
  senderId: string,
  senderName: string,
) {
  const dmDelivery = notifyDM(envelope)
  const baseRow = {
    id: deliveryLog.messageId,
    campaign_id: campaignId,
    sender_user_id: senderId,
    recipient_user_id: envelope.recipientUserId ?? null,
    message_type: envelope.messageType,
    message: envelope.body,
  }
  const fullRow = {
    ...baseRow,
    title: envelope.title,
    sender_name: senderName,
    recipient_ids: envelope.recipientIds,
    dm_recipient_id: dmDelivery.dmRecipientId,
    visibility_level: dmDelivery.visibilityLevel,
    delivery_status: envelope.deliveryStatus,
  }
  return { baseRow, fullRow }
}

async function deliverPartyMessage(campaignId: string, envelope: DeliveryEnvelope) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return { error: 'You are not in this campaign.' }

  const { senderName } = await getCampaignRecipients(campaignId, user.id)
  const deliveryLog = logPartyMessage(envelope, user.id, senderName)
  const { baseRow, fullRow } = rowForEnvelope(campaignId, envelope, deliveryLog, user.id, senderName)

  // Full row uses the migration-016 columns. If the deployed schema is older
  // (e.g. missing title/recipient_ids/dm_recipient_id/delivery_status), the
  // insert fails with a "column / schema cache" error — fall back to the base
  // columns so party messages (Talk, announcements, nudges) still send.
  // We no longer write `delivery_log`; nothing reads it anymore.
  let { error } = await supabase.from('party_messages').insert(fullRow)
  if (error && /column|schema cache/i.test(error.message)) {
    ;({ error } = await supabase.from('party_messages').insert(baseRow))
  }

  if (error && envelope.messageType === 'nudge' && /message_type|check constraint/i.test(error.message)) {
    const fallbackEnvelope: DeliveryEnvelope = {
      ...envelope,
      messageType: 'whisper',
      title: envelope.title,
      body: `Action nudge: ${envelope.body}`,
      recipientIds: [],
    }
    const fallbackLog = logPartyMessage(fallbackEnvelope, user.id, senderName)
    const fallbackRows = rowForEnvelope(campaignId, fallbackEnvelope, fallbackLog, user.id, senderName)
    ;({ error } = await supabase.from('party_messages').insert(fallbackRows.fullRow))
    if (error && /column|schema cache/i.test(error.message)) {
      ;({ error } = await supabase.from('party_messages').insert(fallbackRows.baseRow))
    }
    if (!error) {
      revalidatePath(`/campaigns/${campaignId}`)
      return { success: true, messageId: fallbackLog.messageId, deliveryStatus: envelope.deliveryStatus }
    }
  }

  if (error) return { error: 'Message could not be sent. Please try again.' }
  revalidatePath(`/campaigns/${campaignId}`)
  return { success: true, messageId: deliveryLog.messageId, deliveryStatus: envelope.deliveryStatus }
}

export async function sendPartyMeeting(campaignId: string) {
  const { user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }
  const recipients = await getCampaignRecipients(campaignId, user.id)
  return deliverPartyMessage(
    campaignId,
    notifyAllPlayers(
      'meeting',
      `Party Meeting Called by ${recipients.senderName}`,
      'Everyone has been alerted.',
      recipients.playerIds,
      recipients.dmRecipientId,
    ),
  )
}

export async function sendPartyAnnouncement(campaignId: string, message: string) {
  const { user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }
  const recipients = await getCampaignRecipients(campaignId, user.id)
  const body = cleanMessage(message, 'Party announcement.')
  return deliverPartyMessage(
    campaignId,
    notifyAllPlayers(
      'announcement',
      `Party Announcement from ${recipients.senderName}`,
      body,
      recipients.playerIds,
      recipients.dmRecipientId,
    ),
  )
}

export async function sendWhisper(campaignId: string, recipientUserId: string | null, message: string) {
  if (!recipientUserId) return { error: 'Choose a party member to whisper to.' }
  const { user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }
  const recipients = await getCampaignRecipients(campaignId, user.id)
  const recipient = recipients.members.find((member) => member.user_id === recipientUserId)
  if (!recipient) return { error: 'That party member is not available.' }
  const { supabase } = await getClientAndUser()
  const { data: recipientProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', recipientUserId)
    .maybeSingle()
  const recipientName = recipientProfile?.display_name
  return deliverPartyMessage(
    campaignId,
    notifyPlayer(
      `Whisper Sent to ${recipientName ?? 'Party Member'}`,
      cleanMessage(message, 'Private whisper.'),
      recipientUserId,
      recipients.dmRecipientId,
    ),
  ).then((result) => ({
    ...result,
    recipientName: recipientName ?? 'Party member',
  }))
}

export async function sendDMNudge(
  campaignId: string,
  input: {
    actionType: string
    targetName?: string | null
    intentId?: string | null
    waitingSince?: string | null
  },
) {
  const { user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }
  const recipients = await getCampaignRecipients(campaignId, user.id)
  if (!recipients.dmRecipientId) return { error: 'No DM is available for this campaign.' }

  const target = input.targetName ? ` targeting ${input.targetName}` : ''
  const waiting = input.waitingSince
    ? `Waiting since ${new Date(input.waitingSince).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
    : 'Waiting for DM review.'

  return deliverPartyMessage(campaignId, {
    messageType: 'nudge',
    title: `Action Nudge from ${recipients.senderName}`,
    body: `${input.actionType}${target}. ${waiting}`,
    recipientIds: [],
    dmRecipientId: recipients.dmRecipientId,
    visibilityLevel: 'dm_metadata',
    deliveryStatus: 'sent',
    recipientUserId: recipients.dmRecipientId,
    intentId: input.intentId ?? null,
  }).then((result) => ({
    ...result,
    intentId: input.intentId ?? null,
  }))
}

export async function sendPartyMessage(
  campaignId: string,
  input: {
    messageType: PartyMessageType
    message: string
    recipientUserId?: string | null
  },
) {
  if (input.messageType === 'meeting') return sendPartyMeeting(campaignId)
  if (input.messageType === 'announcement') return sendPartyAnnouncement(campaignId, input.message)
  if (input.messageType === 'nudge') return sendDMNudge(campaignId, {
    actionType: cleanMessage(input.message, 'Action request'),
  })
  return sendWhisper(campaignId, input.recipientUserId ?? null, input.message)
}
