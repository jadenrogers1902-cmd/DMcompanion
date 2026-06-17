'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { AdventureStatus, PreparedMapToken, TokenRevealState } from '@/lib/types/adventure'
import type { CodexPlayer } from '@/lib/actions/codex'
import { revealCampaignDocForLiveObject } from '@/lib/actions/codex'
import { CodexRevealControls } from '@/components/codex/CodexRevealControls'
import { campaignDocTypeLabel } from '@/lib/codex/options'
import type { CampaignDoc, CampaignDocLink } from '@/lib/types/database'
import {
  PREPARED_TOKEN_TYPES,
  REVEAL_STATE_OPTIONS,
  preparedTokenTypeMeta,
  revealStateIsPlayerVisible,
} from './token-meta'
import { ADVENTURE_STATUS_OPTIONS } from './adventure-status'
import { PrepDatabasePanel } from './PrepDatabasePanel'
import { TokenResourceLookup } from './TokenResourceLookup'
import { normalizePrepLinks, tagsFromInput } from './prep-metadata'
import { defaultCategoryForTokenType } from '@/lib/srd/open5e'

// Group token types so the panel can show only the fields that make sense:
// creatures get combat/movement + a stat-block lookup; locations get
// world/room fields and never combat; objects get interaction + object state.
type TokenKind = 'creature' | 'location' | 'object'
function tokenKind(type: string): TokenKind {
  if (type === 'location' || type === 'sub_location') return 'location'
  if (type === 'enemy' || type === 'boss' || type === 'hostile_enemy' || type === 'npc' || type === 'character') {
    return 'creature'
  }
  return 'object'
}

/** A collapsible pill section inside the token modal. Manages its own open state. */
function Collapsible({
  title,
  defaultOpen = false,
  accent = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  accent?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-zinc-800/50 ${
          accent ? 'text-amber-300' : 'text-zinc-200'
        }`}
      >
        <span>{title}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
      {open && <div className="flex flex-col gap-3 border-t border-zinc-800 p-3">{children}</div>}
    </section>
  )
}

interface TokenDetailPanelProps {
  token: PreparedMapToken
  campaignId: string
  codexDocs?: CampaignDoc[]
  codexLinks?: CampaignDocLink[]
  players?: CodexPlayer[]
  related?: {
    adventureId: string
    adventureTitle?: string
    chapterId: string
    chapterTitle?: string
    preparedMapId: string
    preparedMapTitle?: string
  }
  onChange: (patch: Partial<PreparedMapToken>) => void
  onRemove: () => void
  onClose: () => void
}

export function TokenDetailPanel({
  token,
  campaignId,
  codexDocs = [],
  codexLinks = [],
  players = [],
  related,
  onChange,
  onRemove,
  onClose,
}: TokenDetailPanelProps) {
  const meta = preparedTokenTypeMeta(token.token_type)
  const revealOption = REVEAL_STATE_OPTIONS.find((option) => option.value === token.reveal_state)
  const linkedDoc = token.linked_campaign_doc_id
    ? codexDocs.find((doc) => doc.id === token.linked_campaign_doc_id) ?? null
    : null
  const linkedRows = codexLinks.filter(
    (link) => link.live_object_id === token.id && link.source_doc_id === token.linked_campaign_doc_id,
  )
  const [attachDocId, setAttachDocId] = useState('')
  const attachDoc = codexDocs.find((doc) => doc.id === attachDocId) ?? null

  function attachCodexDoc() {
    if (!attachDoc) return
    onChange({
      linked_campaign_doc_id: attachDoc.id,
      source: attachDoc.source,
      name: token.name || attachDoc.title,
      description: token.description || attachDoc.player_summary || '',
      player_notes: token.player_notes || attachDoc.player_summary || '',
      dm_notes: token.dm_notes || [attachDoc.dm_summary, attachDoc.dm_notes].filter(Boolean).join('\n\n'),
      tags: Array.from(new Set([...token.tags, ...attachDoc.tags])),
    })
    setAttachDocId('')
  }

  function setRevealState(state: TokenRevealState) {
    onChange({ reveal_state: state, visible_to_players: revealStateIsPlayerVisible(state) })
  }

  // Per-type field visibility.
  const kind = tokenKind(token.token_type)
  const showCombatBlock = kind === 'creature'
  const showObjectState = kind === 'object'
  const showResource = kind === 'creature' || token.token_type === 'item' || token.token_type === 'loot'
  const dmNotesLabel =
    kind === 'location'
      ? 'What Happens Here? / Room Secret (DM-only)'
      : kind === 'creature'
        ? 'DM Tactics & Secrets (private)'
        : 'DM Notes (private)'
  const dmNotesPlaceholder =
    kind === 'location'
      ? 'What players find here, room secrets, triggers. Never shown to players.'
      : kind === 'creature'
        ? 'Tactics, weaknesses, secret motives. Never shown to players.'
        : 'Trigger conditions, contents, secrets. Never shown to players.'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Token: ${token.name || meta.label}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header (fixed) */}
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/40 text-lg"
                style={{ backgroundColor: token.color }}
              >
                {token.icon || meta.icon}
              </span>
              <input
                value={token.name}
                onChange={(event) => onChange({ name: event.target.value })}
                placeholder={meta.label}
                maxLength={80}
                className="min-w-0 flex-1 border-none bg-transparent text-lg font-semibold text-zinc-100 outline-none placeholder:text-zinc-600"
                aria-label="Token name"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Close token panel"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="dm">{meta.label}</Badge>
            <Badge variant={token.reveal_state === 'visible' ? 'success' : 'default'}>
              {revealOption?.label ?? token.reveal_state}
            </Badge>
            <span className="text-xs text-zinc-600">
              at {Math.round(token.x)}, {Math.round(token.y)}
            </span>
          </div>
        </div>

        {/* Body (scrollable) — grouped into collapsible pill sections */}
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-4">
        <Collapsible title="Identity">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Type"
              value={token.token_type}
              onChange={(event) => {
                const next = preparedTokenTypeMeta(event.target.value)
                const usingTypeDefaults = token.icon === meta.icon && token.color === meta.color
                onChange({
                  token_type: next.value,
                  ...(usingTypeDefaults ? { icon: next.icon, color: next.color } : {}),
                })
              }}
            >
              {PREPARED_TOKEN_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </option>
              ))}
            </Select>
            <Input
              label="Icon"
              value={token.icon}
              maxLength={8}
              onChange={(event) => onChange({ icon: event.target.value })}
              hint="Emoji shown on the map"
            />
          </div>
          <Input
            label="Tags"
            value={token.tags.join(', ')}
            placeholder="boss, clue, session-3"
            onChange={(event) => onChange({ tags: tagsFromInput(event.target.value) })}
            hint="Comma-separated prep tags."
          />
        </Collapsible>

        <Collapsible title="Visibility & Behavior">
          <Select
            label="Visibility"
            value={token.reveal_state}
            hint={revealOption?.hint}
            onChange={(event) => setRevealState(event.target.value as TokenRevealState)}
          >
            {REVEAL_STATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            label="Prep Status"
            value={token.status}
            onChange={(event) => onChange({ status: event.target.value as AdventureStatus })}
          >
            {ADVENTURE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          {/* Behavior — only the controls relevant to this token kind. */}
          <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
            {showCombatBlock && (
              <>
                <label className="flex items-center justify-between gap-3">
                  <span>Dynamic entity token</span>
                  <input
                    type="checkbox"
                    checked={token.is_dynamic !== false}
                    onChange={(event) =>
                      onChange({
                        is_dynamic: event.target.checked,
                        can_move: event.target.checked ? token.can_move !== false : false,
                        can_participate_in_combat: event.target.checked
                          ? Boolean(token.can_participate_in_combat)
                          : false,
                      })
                    }
                    className="h-4 w-4 accent-amber-500"
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span>Can move after deployment</span>
                  <input
                    type="checkbox"
                    checked={token.can_move !== false}
                    disabled={token.is_dynamic === false}
                    onChange={(event) => onChange({ can_move: event.target.checked })}
                    className="h-4 w-4 accent-amber-500 disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span>Can participate in combat</span>
                  <input
                    type="checkbox"
                    checked={Boolean(token.can_participate_in_combat)}
                    disabled={token.is_dynamic === false}
                    onChange={(event) => onChange({ can_participate_in_combat: event.target.checked })}
                    className="h-4 w-4 accent-amber-500 disabled:opacity-50"
                  />
                </label>
              </>
            )}
            <label className="flex items-center justify-between gap-3">
              <span>Interactable</span>
              <input
                type="checkbox"
                checked={Boolean(token.interactable)}
                onChange={(event) => onChange({ interactable: event.target.checked })}
                className="h-4 w-4 accent-amber-500"
              />
            </label>
            {kind !== 'creature' && (
              <p className="text-xs text-zinc-500">
                {kind === 'location'
                  ? 'Locations are fixed reference points — players cannot move them.'
                  : 'Static objects stay put; players cannot move them.'}
              </p>
            )}
          </div>

          {showObjectState && (
            <Input
              label="Object state"
              value={token.object_state ?? ''}
              placeholder="closed, locked, hidden, disabled…"
              maxLength={40}
              onChange={(event) => onChange({ object_state: event.target.value || null })}
              hint="Starting state for this object when deployed."
            />
          )}
        </Collapsible>

        <Collapsible title={kind === 'location' ? 'Linked Location Entry' : 'Codex Entry Link'}>
          {linkedDoc ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">{linkedDoc.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {campaignDocTypeLabel(linkedDoc.doc_type)} - Source: {linkedDoc.source === 'notion' ? 'Notion' : linkedDoc.source}
                  </p>
                </div>
                <Badge variant={linkedDoc.visibility === 'revealed' ? 'success' : linkedDoc.visibility === 'player_safe' ? 'player' : 'dm'}>
                  {linkedDoc.visibility === 'revealed' ? 'Revealed' : linkedDoc.visibility === 'player_safe' ? 'Player-safe' : 'DM-only'}
                </Badge>
              </div>
              {linkedDoc.player_summary && (
                <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-300">{linkedDoc.player_summary}</p>
              )}
              {linkedDoc.dm_notes && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-amber-400">DM notes</summary>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-400">{linkedDoc.dm_notes}</p>
                </details>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/campaigns/${campaignId}/codex`}>
                  <Button type="button" size="sm" variant="secondary">Open Codex doc</Button>
                </Link>
                {linkedDoc.source_url && (
                  <a href={linkedDoc.source_url} target="_blank" rel="noopener noreferrer">
                    <Button type="button" size="sm" variant="secondary">Open in Notion</Button>
                  </a>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => onChange({ linked_campaign_doc_id: null, source: 'manual' })}
                >
                  Detach link
                </Button>
              </div>
              <div className="mt-3 border-t border-zinc-800 pt-3">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-600">Reveal player-safe summary</p>
                <CodexRevealControls
                  players={players}
                  compact
                  disabled={!linkedDoc.player_summary}
                  disabledReason="Needs player-safe summary"
                  onReveal={({ scope, playerId, message }) =>
                    revealCampaignDocForLiveObject(campaignId, linkedDoc.id, {
                      live_object_type: token.is_dynamic === false ? 'object' : 'token',
                      live_object_id: token.id,
                      scope,
                      playerId,
                      reveal_message: message,
                    })
                  }
                />
              </div>
              {linkedRows.length === 0 && (
                <p className="mt-3 text-xs text-zinc-600">
                  This prep token stores the Codex link; the live token link is created when the prepared map is sent to the Live Map.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <p className="text-xs text-zinc-500">
                Link this token to a cached Codex entry. This never changes the Notion source.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Select
                  aria-label="Codex entry to attach"
                  value={attachDocId}
                  onChange={(event) => setAttachDocId(event.target.value)}
                >
                  <option value="">Choose Codex entry...</option>
                  {codexDocs.slice(0, 120).map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title} ({campaignDocTypeLabel(doc.doc_type)})
                    </option>
                  ))}
                </Select>
                <Button type="button" size="sm" onClick={attachCodexDoc} disabled={!attachDoc}>
                  Attach
                </Button>
              </div>
            </div>
          )}
        </Collapsible>

        <Collapsible title="Description & Notes">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Description</p>
            <Textarea
              aria-label="Description"
              rows={2}
              maxLength={2000}
              placeholder="Player-safe summary of what this is."
              value={token.description}
              onChange={(event) => onChange({ description: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Player Notes</p>
            <Textarea
              aria-label="Player notes"
              rows={2}
              maxLength={2000}
              placeholder="Read-aloud text or info players get. Becomes public text when deployed."
              value={token.player_notes}
              onChange={(event) => onChange({ player_notes: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-500/80">{dmNotesLabel}</p>
            <Textarea
              aria-label="DM notes"
              rows={3}
              maxLength={4000}
              placeholder={dmNotesPlaceholder}
              value={token.dm_notes}
              onChange={(event) => onChange({ dm_notes: event.target.value })}
            />
          </div>
        </Collapsible>

        <Collapsible title="Appearance">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Size (squares)"
              type="number"
              min={0.5}
              max={10}
              step={0.5}
              value={token.size}
              onChange={(event) =>
                onChange({ size: Math.min(10, Math.max(0.5, Number(event.target.value) || 1)) })
              }
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-300" htmlFor="token-color">
                Color
              </label>
              <input
                id="token-color"
                type="color"
                value={token.color}
                onChange={(event) => onChange({ color: event.target.value })}
                className="h-9 w-full cursor-pointer rounded-lg border border-zinc-700 bg-zinc-900"
              />
            </div>
          </div>
        </Collapsible>

        {showResource && (
          <Collapsible title="Stat Reference">
            <TokenResourceLookup
              resource={token.resource}
              defaultCategory={defaultCategoryForTokenType(token.token_type)}
              onAttach={(resource) => onChange({ resource })}
              onDetach={() => onChange({ resource: null })}
            />
          </Collapsible>
        )}

        <Collapsible title="Prep Database">
          <PrepDatabasePanel
            title="Token Prep Database"
            parentType="token"
            parentId={token.id}
            tags={token.tags}
            notes={token.prep_notes}
            links={normalizePrepLinks(token.links, 'token', token.id)}
            onTagsChange={(tags) => onChange({ tags })}
            onNotesChange={(prep_notes) => onChange({ prep_notes })}
            onLinksChange={(links) => onChange({ links })}
          />
        </Collapsible>

        {related && (
          <Collapsible title="Related Records">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400">
              <div className="truncate">Adventure: {related.adventureTitle || related.adventureId}</div>
              <div className="truncate">Chapter: {related.chapterTitle || related.chapterId}</div>
              <div className="truncate">
                Prepared Map: {related.preparedMapTitle || related.preparedMapId}
              </div>
            </div>
          </Collapsible>
        )}
        </div>

        {/* Footer (fixed) — Remove + Close always reachable */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-950 p-3">
          <Button variant="danger" size="sm" onClick={onRemove}>
            Remove Token
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
