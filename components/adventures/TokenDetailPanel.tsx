'use client'

import Link from 'next/link'
import { useState } from 'react'
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

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 max-h-[75dvh] overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 shadow-2xl lg:inset-x-auto lg:inset-y-0 lg:right-0 lg:bottom-auto lg:max-h-none lg:w-[26rem] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l"
      role="dialog"
      aria-label={`Token: ${token.name || meta.label}`}
    >
      <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 p-4 backdrop-blur">
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
          <Badge variant={token.reveal_state === 'visible' ? 'success' : 'default'}>
            {revealOption?.label ?? token.reveal_state}
          </Badge>
          <span className="text-xs text-zinc-600">
            at {Math.round(token.x)}, {Math.round(token.y)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-4">
        <section className="flex flex-col gap-3">
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

          <Input
            label="Tags"
            value={token.tags.join(', ')}
            placeholder="boss, clue, session-3"
            onChange={(event) => onChange({ tags: tagsFromInput(event.target.value) })}
            hint="Comma-separated prep tags."
          />

          <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
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
            <label className="flex items-center justify-between gap-3">
              <span>Interactable object</span>
              <input
                type="checkbox"
                checked={Boolean(token.interactable)}
                onChange={(event) => onChange({ interactable: event.target.checked })}
                className="h-4 w-4 accent-amber-500"
              />
            </label>
            {token.is_dynamic === false && (
              <p className="text-xs text-zinc-500">Players cannot move static objects.</p>
            )}
          </div>

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
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Codex Entry Link
          </h3>
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
        </section>

        {related && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Related Records
            </h3>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400">
              <div className="truncate">Adventure: {related.adventureTitle || related.adventureId}</div>
              <div className="truncate">Chapter: {related.chapterTitle || related.chapterId}</div>
              <div className="truncate">
                Prepared Map: {related.preparedMapTitle || related.preparedMapId}
              </div>
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Description
          </h3>
          <Textarea
            aria-label="Description"
            rows={2}
            maxLength={2000}
            placeholder="Player-safe summary of what this is."
            value={token.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Player Notes
          </h3>
          <Textarea
            aria-label="Player notes"
            rows={2}
            maxLength={2000}
            placeholder="Read-aloud text or info players get. Becomes public text when deployed."
            value={token.player_notes}
            onChange={(event) => onChange({ player_notes: event.target.value })}
          />
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-500/80">
            Quick DM Note (private)
          </h3>
          <Textarea
            aria-label="DM notes"
            rows={3}
            maxLength={4000}
            placeholder="Tactics, secrets, trigger conditions. Never shown to players."
            value={token.dm_notes}
            onChange={(event) => onChange({ dm_notes: event.target.value })}
          />
        </section>

        <TokenResourceLookup
          resource={token.resource}
          defaultCategory={defaultCategoryForTokenType(token.token_type)}
          onAttach={(resource) => onChange({ resource })}
          onDetach={() => onChange({ resource: null })}
        />

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

        <div className="border-t border-zinc-800 pt-4">
          <Button variant="danger" size="sm" onClick={onRemove}>
            Remove Token
          </Button>
        </div>
      </div>
    </div>
  )
}
