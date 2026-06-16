'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { TokenResourceRef } from '@/lib/types/adventure'
import {
  SRD_CATEGORIES,
  resourceRefFromResult,
  type SrdCategory,
  type SrdSearchResult,
} from '@/lib/srd/open5e'

interface TokenResourceLookupProps {
  resource: TokenResourceRef | null
  defaultCategory: SrdCategory
  onAttach: (resource: TokenResourceRef) => void
  onDetach: () => void
}

function MetadataChips({ metadata }: { metadata: Record<string, string> }) {
  const entries = Object.entries(metadata)
  if (entries.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[11px] text-zinc-400"
        >
          <span className="text-zinc-500">{key}:</span> {value}
        </span>
      ))}
    </div>
  )
}

export function TokenResourceLookup({
  resource,
  defaultCategory,
  onAttach,
  onDetach,
}: TokenResourceLookupProps) {
  const [category, setCategory] = useState<SrdCategory>(defaultCategory)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SrdSearchResult[]>([])
  const [hasSearched, setHasSearched] = useState(false)

  async function runSearch(event: React.FormEvent) {
    event.preventDefault()
    const q = query.trim()
    if (q.length < 2) {
      setError('Enter at least 2 characters to search.')
      return
    }
    setLoading(true)
    setError(null)
    setHasSearched(true)
    try {
      const res = await fetch(
        `/api/srd?category=${category}&q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' } },
      )
      const data = (await res.json()) as { results?: SrdSearchResult[]; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Lookup failed. Try again.')
        setResults([])
        return
      }
      setResults(data.results ?? [])
    } catch {
      setError('Lookup failed. Check your connection and try again.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function attach(result: SrdSearchResult) {
    onAttach(resourceRefFromResult(result, new Date().toISOString()))
    setResults([])
    setQuery('')
    setHasSearched(false)
    setError(null)
  }

  // ── Attached state ────────────────────────────────────────
  if (resource) {
    const syncedDate = resource.synced_at ? resource.synced_at.slice(0, 10) : null
    return (
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          SRD Resource
        </h3>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-zinc-100">
                  {resource.name}
                </span>
                <Badge variant="default">{resource.category}</Badge>
              </div>
              {resource.summary && (
                <p className="mt-0.5 text-xs text-zinc-400">{resource.summary}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onDetach}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
            >
              Detach
            </button>
          </div>

          <MetadataChips metadata={resource.metadata} />

          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
            {resource.source_url && (
              <a
                href={resource.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400/90 hover:text-amber-300"
              >
                View source data ↗
              </a>
            )}
            <span className="text-zinc-600">
              from {resource.source}
              {syncedDate ? ` · synced ${syncedDate}` : ''}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">
          Reference data only — your DM notes are kept separate and untouched.
        </p>
      </section>
    )
  }

  // ── Search state ──────────────────────────────────────────
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        SRD Resource <span className="text-zinc-600">(optional)</span>
      </h3>
      <form onSubmit={runSearch} className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Resource category"
          value={category}
          onChange={(event) => setCategory(event.target.value as SrdCategory)}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
        >
          {SRD_CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          aria-label="Search SRD resources"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name (e.g. goblin)"
          maxLength={60}
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500"
        />
        <Button type="submit" size="sm" loading={loading} disabled={loading}>
          Search
        </Button>
      </form>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {!error && hasSearched && !loading && results.length === 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          No SRD matches. Try a different name or category.
        </p>
      )}

      {results.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {results.map((result) => (
            <button
              key={`${result.category}:${result.source_id}`}
              type="button"
              onClick={() => attach(result)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left transition-colors hover:border-amber-500/60 hover:bg-amber-500/5"
            >
              <span className="text-sm font-medium text-zinc-100">{result.name}</span>
              {result.summary && (
                <span className="mt-0.5 block text-xs text-zinc-500">{result.summary}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 text-[11px] text-zinc-600">
        Looks up the WotC 5e SRD (CC BY 4.0) via Open5e. Stores a short reference
        and a link — never the full text, and never your DM notes.
      </p>
    </section>
  )
}
