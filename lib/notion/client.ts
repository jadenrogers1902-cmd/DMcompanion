// Server-side Notion API client. SERVER-ONLY — only import from `'use server'`
// modules. Never call from client code; the integration token must never reach
// the browser. Uses fetch against the Notion REST API (no SDK dependency).
//
// All functions return a discriminated result and never throw raw API errors at
// callers. `normalizeNotionError` maps HTTP/transport failures to clean,
// user-safe messages — raw Notion error bodies are never surfaced to the UI.

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

export type NotionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'rate_limited'
  | 'unavailable'

export type NotionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: NotionErrorCode; message: string; status?: number; notionCode?: string }

const CLEAN_MESSAGES: Record<NotionErrorCode, string> = {
  unauthorized: 'The stored Notion token is invalid or has been revoked. Update the token in campaign settings and run Test connection again.',
  forbidden: 'This page is not shared with the Notion integration.',
  not_found: 'This Notion page could not be found.',
  invalid_request: 'That Notion link could not be used as a database.',
  rate_limited: 'Notion is rate-limiting requests. Try again shortly.',
  unavailable: 'Notion could not be reached. Check your network connection and try again.',
}

/**
 * Maps an HTTP status (or transport failure, status omitted) to a clean,
 * user-safe message. Never echoes the raw Notion error body.
 */
export function normalizeNotionError(status?: number, notionCode?: string): {
  code: NotionErrorCode
  message: string
} {
  let code: NotionErrorCode
  if (status === 401) code = 'unauthorized'
  else if (status === 403) code = 'forbidden'
  else if (status === 404) code = 'not_found'
  else if (status === 400 || notionCode === 'validation_error') code = 'invalid_request'
  else if (status === 429) code = 'rate_limited'
  else code = 'unavailable'
  return { code, message: CLEAN_MESSAGES[code] }
}

function toDashedUuid(hex32: string): string {
  const h = hex32.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * Extracts a Notion page/database id from a raw id or a Notion URL. Accepts a
 * bare 32-hex / dashed-UUID id, or any notion.so / *.notion.site URL whose path
 * ends in such an id. Returns the dashed-UUID form, or null if none found.
 */
export function extractNotionId(input: string): string | null {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return null

  // Bare id (compact or dashed).
  const bare = trimmed.replace(/-/g, '')
  if (/^[0-9a-fA-F]{32}$/.test(bare)) return toDashedUuid(bare)

  // URL form.
  try {
    const url = new URL(trimmed)
    const host = url.hostname.toLowerCase()
    const isNotion =
      host === 'app.notion.com' ||
      host === 'notion.so' ||
      host === 'notion.site' ||
      host.endsWith('.notion.so') ||
      host.endsWith('.notion.site')
    if (!isNotion) return null
    const runs = url.pathname.replace(/-/g, '').match(/[0-9a-fA-F]{32}/g)
    if (runs && runs.length > 0) return toDashedUuid(runs[runs.length - 1])
  } catch {
    return null
  }
  return null
}

async function notionFetch<T>(
  token: string,
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<NotionResult<T>> {
  if (!token?.trim()) {
    const err = normalizeNotionError(401)
    return { ok: false, ...err }
  }

  let response: Response
  try {
    response = await fetch(`${NOTION_API}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      // Never cache authenticated Notion responses.
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // Network failure / timeout / abort — keep it generic.
    const err = normalizeNotionError()
    return { ok: false, ...err }
  }

  if (!response.ok) {
    let notionCode: string | undefined
    try {
      const body = (await response.json()) as { code?: unknown }
      notionCode = typeof body.code === 'string' ? body.code : undefined
    } catch {
      notionCode = undefined
    }
    const err = normalizeNotionError(response.status, notionCode)
    return { ok: false, ...err, status: response.status, notionCode }
  }

  try {
    const data = (await response.json()) as T
    return { ok: true, data }
  } catch {
    const err = normalizeNotionError()
    return { ok: false, ...err }
  }
}

/** Verifies a token by calling GET /users/me. */
export async function testNotionConnection(
  token: string,
): Promise<NotionResult<{ botName: string | null }>> {
  const result = await notionFetch<{ name?: string; bot?: { owner?: unknown } }>(
    token,
    '/users/me',
  )
  if (!result.ok) return result
  return { ok: true, data: { botName: result.data.name ?? null } }
}

export async function fetchNotionPage(
  token: string,
  pageId: string,
): Promise<NotionResult<NotionPage>> {
  return notionFetch<NotionPage>(token, `/pages/${pageId}`)
}

export async function fetchNotionDatabase(
  token: string,
  databaseId: string,
): Promise<NotionResult<NotionDatabase>> {
  return notionFetch<NotionDatabase>(token, `/databases/${databaseId}`)
}

export type NotionDatabaseSummary = {
  id: string
  title: string
  properties: { name: string; type: string; relationDatabaseId: string | null }[]
}

type NotionSearchResult = {
  object?: string
  id?: string
  title?: NotionRichText[]
  properties?: Record<string, { type?: string; relation?: { database_id?: string } }>
}

/**
 * Lists databases the integration can access via the Notion search endpoint.
 * Paginated, capped. Returns clean summaries (id, title, property list with
 * relation targets) — never the raw API payload.
 */
export async function searchNotionDatabases(
  token: string,
): Promise<NotionResult<NotionDatabaseSummary[]>> {
  const out: NotionDatabaseSummary[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const result = await notionFetch<{ results: NotionSearchResult[]; has_more: boolean; next_cursor: string | null }>(
      token,
      '/search',
      {
        method: 'POST',
        body: {
          filter: { value: 'database', property: 'object' },
          page_size: 100,
          start_cursor: cursor,
        },
      },
    )
    if (!result.ok) return result
    for (const db of result.data.results) {
      if (db.object !== 'database' || !db.id) continue
      const properties = Object.entries(db.properties ?? {}).map(([name, def]) => ({
        name,
        type: def?.type ?? 'unknown',
        relationDatabaseId: def?.relation?.database_id ?? null,
      }))
      out.push({ id: db.id, title: richTextToPlain(db.title) || 'Untitled database', properties })
    }
    cursor = result.data.has_more ? result.data.next_cursor ?? undefined : undefined
    pages += 1
    if (pages >= 3) cursor = undefined
  } while (cursor)

  return { ok: true, data: out }
}

export async function queryNotionDatabase(
  token: string,
  databaseId: string,
  body?: { page_size?: number; start_cursor?: string; filter?: unknown; sorts?: unknown },
): Promise<NotionResult<NotionDatabaseQuery>> {
  return notionFetch<NotionDatabaseQuery>(token, `/databases/${databaseId}/query`, {
    method: 'POST',
    body: { page_size: 50, ...body },
  })
}

export async function fetchNotionBlockChildren(
  token: string,
  blockId: string,
  startCursor?: string | null,
): Promise<NotionResult<NotionBlockChildren>> {
  const cursor = startCursor ? `&start_cursor=${encodeURIComponent(startCursor)}` : ''
  return notionFetch<NotionBlockChildren>(
    token,
    `/blocks/${blockId}/children?page_size=100${cursor}`,
  )
}

export async function findChildNotionDatabases(
  token: string,
  rootBlockId: string,
  maxDepth = 3,
): Promise<NotionResult<NotionChildDatabase[]>> {
  const found: NotionChildDatabase[] = []
  const visited = new Set<string>()

  async function walk(blockId: string, depth: number): Promise<NotionResult<null>> {
    if (depth > maxDepth || visited.has(blockId)) return { ok: true, data: null }
    visited.add(blockId)

    let cursor: string | null = null
    do {
      const result = await fetchNotionBlockChildren(token, blockId, cursor)
      if (!result.ok) return result

      for (const block of result.data.results) {
        if (block.type === 'child_database' && block.id) {
          found.push({
            id: block.id,
            title: block.child_database?.title || 'Untitled database',
          })
        } else if (block.has_children && block.id) {
          const childResult = await walk(block.id, depth + 1)
          if (!childResult.ok) return childResult
        }
      }

      cursor = result.data.has_more ? result.data.next_cursor : null
    } while (cursor)

    return { ok: true, data: null }
  }

  const result = await walk(rootBlockId, 0)
  if (!result.ok) return result
  return { ok: true, data: found }
}

// --- Parsing helpers --------------------------------------------------------
// Minimal structural typing for the Notion shapes we read. We only model what
// we consume; everything else is treated opaquely.

type NotionRichText = { plain_text?: string }
type NotionPropertyValue = {
  type?: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  select?: { name?: string } | null
  multi_select?: { name?: string }[]
  status?: { name?: string } | null
  checkbox?: boolean
  number?: number | null
  url?: string | null
  date?: { start?: string | null; end?: string | null } | null
  people?: { id?: string }[]
  relation?: { id?: string }[]
  [key: string]: unknown
}

export type NotionPage = {
  id: string
  url?: string
  properties?: Record<string, NotionPropertyValue>
}

export type NotionDatabase = {
  id: string
  url?: string
  title?: NotionRichText[]
  properties?: Record<string, { type?: string }>
}

export type NotionDatabaseQuery = {
  results: NotionPage[]
  has_more: boolean
  next_cursor: string | null
}

export type NotionChildDatabase = {
  id: string
  title: string
}

export type NotionBlock = {
  id: string
  type?: string
  has_children?: boolean
  child_database?: { title?: string }
}

export type NotionBlockChildren = {
  results: NotionBlock[]
  has_more: boolean
  next_cursor: string | null
}

function richTextToPlain(rich?: NotionRichText[]): string {
  if (!Array.isArray(rich)) return ''
  return rich.map((part) => part.plain_text ?? '').join('').trim()
}

/** Extracts the page/database title as plain text, or '' if none. */
export function parseNotionTitle(source: NotionPage | NotionDatabase): string {
  // Database title lives at the top level.
  if ('title' in source && Array.isArray(source.title)) {
    const dbTitle = richTextToPlain(source.title)
    if (dbTitle) return dbTitle
  }
  // Page title is the `title`-typed property.
  const props = (source as NotionPage).properties
  if (props) {
    for (const value of Object.values(props)) {
      if (value?.type === 'title') return richTextToPlain(value.title)
    }
  }
  return ''
}

/**
 * Flattens a page's properties into plain JS values keyed by property name.
 * Unknown property types are skipped rather than passed through raw.
 */
export function parseNotionProperties(page: NotionPage): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const props = page.properties
  if (!props) return out

  for (const [name, value] of Object.entries(props)) {
    switch (value?.type) {
      case 'title':
        out[name] = richTextToPlain(value.title)
        break
      case 'rich_text':
        out[name] = richTextToPlain(value.rich_text)
        break
      case 'select':
        out[name] = value.select?.name ?? null
        break
      case 'status':
        out[name] = value.status?.name ?? null
        break
      case 'multi_select':
        out[name] = (value.multi_select ?? []).map((opt) => opt.name).filter(Boolean)
        break
      case 'checkbox':
        out[name] = Boolean(value.checkbox)
        break
      case 'number':
        out[name] = value.number ?? null
        break
      case 'url':
        out[name] = value.url ?? null
        break
      case 'date':
        out[name] = value.date?.start ?? null
        break
      case 'relation':
        out[name] = (value.relation ?? []).map((rel) => rel.id).filter(Boolean)
        break
      default:
        // Unsupported property type — skip rather than leak raw API shapes.
        break
    }
  }
  return out
}
