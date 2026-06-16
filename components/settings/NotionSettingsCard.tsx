'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import {
  disableNotionConnection,
  getNotionConnectionStatus,
  saveNotionToken,
  setNotionAutoSync,
  testNotionConnection,
  type NotionConnectionStatus,
} from '@/lib/actions/notion-settings'
import { syncAllNotionDatabases } from '@/lib/actions/notion-sync'

function formatTime(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function NotionSettingsCard({ campaignId }: { campaignId: string }) {
  const [status, setStatus] = useState<NotionConnectionStatus | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState<'save' | 'test' | 'disable' | 'autosync' | 'retry' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function refresh() {
    const next = await getNotionConnectionStatus(campaignId)
    setStatus(next)
  }

  useEffect(() => {
    let active = true
    getNotionConnectionStatus(campaignId).then((next) => {
      if (active) setStatus(next)
    })
    return () => {
      active = false
    }
  }, [campaignId])

  async function handleSave() {
    setBusy('save')
    setError(null)
    setNotice(null)
    setTestResult(null)
    const result = await saveNotionToken(campaignId, token)
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    // Clear the field immediately — the token is write-only and never read back.
    setToken('')
    setNotice('Notion token saved. Run a connection test to verify it.')
    await refresh()
  }

  async function handleTest() {
    setBusy('test')
    setError(null)
    setNotice(null)
    setTestResult(null)
    const result = await testNotionConnection(campaignId)
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setTestResult({ ok: result.status === 'success', message: result.message ?? '' })
    await refresh()
  }

  async function handleDisable() {
    setBusy('disable')
    setError(null)
    setNotice(null)
    setTestResult(null)
    const result = await disableNotionConnection(campaignId)
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNotice('Notion connection disabled and the stored token was removed.')
    await refresh()
  }

  async function handleToggleAutoSync() {
    if (!status) return
    setBusy('autosync')
    setError(null)
    setNotice(null)
    const result = await setNotionAutoSync(campaignId, !status.autoSyncEnabled)
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNotice(status.autoSyncEnabled ? 'Auto-sync disabled.' : 'Auto-sync enabled.')
    await refresh()
  }

  async function handleRetry() {
    setBusy('retry')
    setError(null)
    setNotice(null)
    const result = await syncAllNotionDatabases(campaignId)
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNotice(`Manual sync complete — ${result.message ?? 'done.'}`)
    await refresh()
  }

  const lastTested = formatTime(status?.lastTestedAt ?? null)
  const lastSuccess = formatTime(status?.lastSuccessAt ?? null)
  const lastWebhook = formatTime(status?.lastWebhookAt ?? null)
  const lastAutoSync = formatTime(status?.lastAutoSyncAt ?? null)

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            Notion Integration
            {status?.configured && status.enabled ? (
              <Badge variant="success">Connected</Badge>
            ) : (
              <Badge variant="default">Not connected</Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>

      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-500">
          Connect a Notion internal integration so the app can sync your campaign
          documentation into the Adventure Codex. The token is stored on the server
          only — it is never shown again, sent to the browser, or visible to players.
        </p>

        {status && !status.serverReady && (
          <Alert
            variant="info"
            message={
              status.serverError ??
              'Notion is not configured on the server yet. Set SUPABASE_SERVICE_ROLE_KEY to your Supabase service_role key, not the Notion token.'
            }
          />
        )}

        {error && <Alert message={error} />}
        {notice && <Alert variant="success" message={notice} />}
        {testResult && (
          <Alert
            variant={testResult.ok ? 'success' : undefined}
            message={testResult.message}
          />
        )}

        {status?.configured && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs text-zinc-400">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                Last test:{' '}
                <span
                  className={
                    status.lastTestStatus === 'success'
                      ? 'text-emerald-400'
                      : status.lastTestStatus === 'failed'
                        ? 'text-red-400'
                        : 'text-zinc-400'
                  }
                >
                  {status.lastTestStatus === 'never' ? 'not tested yet' : status.lastTestStatus}
                </span>
              </span>
              {lastTested && <span>Tested: {lastTested}</span>}
              {lastSuccess && <span>Last verified: {lastSuccess}</span>}
            </div>
            {status.lastTestStatus === 'failed' && status.lastTestError && (
              <p className="mt-1 text-red-300">{status.lastTestError}</p>
            )}
          </div>
        )}

        <Input
          label={status?.configured ? 'Replace Notion token' : 'Notion integration token'}
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={status?.configured ? 'Enter a new token to replace the stored one' : 'ntn_… or secret_…'}
          disabled={!status?.serverReady}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            loading={busy === 'save'}
            disabled={!status?.serverReady || !token.trim()}
          >
            {status?.configured ? 'Update token' : 'Save token'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleTest}
            loading={busy === 'test'}
            disabled={!status?.serverReady || !status?.configured}
          >
            Test connection
          </Button>
          {status?.configured && (
            <Button
              size="sm"
              variant="danger"
              onClick={handleDisable}
              loading={busy === 'disable'}
            >
              Disable
            </Button>
          )}
        </div>

        {status?.configured && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-100">Auto-sync from Notion</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  When a Notion webhook is configured, edits sync automatically into
                  the Codex. Requires the webhook endpoint + <code className="text-zinc-400">NOTION_WEBHOOK_SECRET</code>.
                </p>
              </div>
              <Button
                size="sm"
                variant={status.autoSyncEnabled ? 'danger' : 'primary'}
                onClick={handleToggleAutoSync}
                loading={busy === 'autosync'}
              >
                {status.autoSyncEnabled ? 'Turn off' : 'Turn on'}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span>
                Auto-sync:{' '}
                <span className={status.autoSyncEnabled ? 'text-emerald-400' : 'text-zinc-400'}>
                  {status.autoSyncEnabled ? 'on' : 'off'}
                </span>
              </span>
              {lastWebhook && <span>Last webhook: {lastWebhook}</span>}
              {lastAutoSync && <span>Last auto-sync: {lastAutoSync}</span>}
              {status.lastAutoSyncStatus !== 'never' && (
                <span
                  className={
                    status.lastAutoSyncStatus === 'success'
                      ? 'text-emerald-400'
                      : status.lastAutoSyncStatus === 'failed'
                        ? 'text-red-400'
                        : 'text-yellow-400'
                  }
                >
                  Status: {status.lastAutoSyncStatus}
                </span>
              )}
              {status.failedSyncCount > 0 && (
                <span className="text-red-400">Failed syncs: {status.failedSyncCount}</span>
              )}
            </div>

            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={handleRetry} loading={busy === 'retry'}>
                Manual sync now
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
