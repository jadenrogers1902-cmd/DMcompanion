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
          className="rounded-md border border-border bg-canvas px-1.5 py-0.5 text-[11px] text-muted"
        >
          <span className="text-faint">{key}:</span> {value}
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
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          SRD Resource
        </h3>
        <div className="rounded-lg border border-border bg-panel p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-content">
                  {resource.name}
                </span>
                <Badge variant="default">{resource.category}</Badge>
              </div>
              {resource.summary && (
                <p className="mt-0.5 text-xs text-muted">{resource.summary}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onDetach}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-faint hover:bg-panel-raised hover:text-red-400"
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
                className="text-accent/90 hover:text-accent"
              >
                View source data ↗
              </a>
            )}
            <span className="text-faint">
              from {resource.source}
              {syncedDate ? ` · synced ${syncedDate}` : ''}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Reference data only — your DM notes are kept separate and untouched.
        </p>
      </section>
    )
  }

  // ── Search state ──────────────────────────────────────────
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
        SRD Resource <span className="text-faint">(optional)</span>
      </h3>
      <form onSubmit={runSearch} className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Resource category"
          value={category}
          onChange={(event) => setCategory(event.target.value as SrdCategory)}
          className="rounded-lg border border-border-strong bg-panel px-2 py-2 text-sm text-content outline-none focus:border-accent"
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
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-panel px-3 py-2 text-sm text-content placeholder:text-faint outline-none focus:border-accent"
        />
        <Button type="submit" size="sm" loading={loading} disabled={loading}>
          Search
        </Button>
      </form>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {!error && hasSearched && !loading && results.length === 0 && (
        <p className="mt-2 text-xs text-faint">
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
              className="rounded-lg border border-border bg-canvas px-3 py-2 text-left transition-colors hover:border-accent/60 hover:bg-accent/5"
            >
              <span className="text-sm font-medium text-content">{result.name}</span>
              {result.summary && (
                <span className="mt-0.5 block text-xs text-faint">{result.summary}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 text-[11px] text-faint">
        Looks up the WotC 5e SRD (CC BY 4.0) via Open5e. Stores a short reference
        and a link — never the full text, and never your DM notes.
      </p>
    </section>
  )
}
