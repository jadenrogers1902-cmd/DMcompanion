'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import {
  getLiveMapDeployContext,
  sendPreparedMapToLiveMap,
  type DeployMode,
  type DeployPreviewSummary,
} from '@/lib/actions/prepared-maps'

interface SendToLiveMapButtonProps {
  campaignId: string
  preparedMapId: string
  hasImage: boolean
  /** Unsaved editor changes — block deploy until saved so prep + live agree. */
  dirty: boolean
}

type DeployContext = {
  activeMapName: string | null
  existingDeployCount: number
  preview: DeployPreviewSummary | null
}
type DeployResult = {
  liveMapId: string
  mode: DeployMode
  activated: boolean
  replacedMapName: string | null
}

const MODE_INFO: { mode: DeployMode; title: string; description: string }[] = [
  {
    mode: 'next_scene',
    title: 'Add as next scene',
    description:
      'Creates a new live map. Players keep seeing the current map until you activate this one.',
  },
  {
    mode: 'duplicate',
    title: 'Duplicate into Live Map',
    description:
      'Creates an independent copy (named “… (Copy)”). Useful for deploying the same prep more than once.',
  },
  {
    mode: 'replace_active',
    title: 'Replace current Live Map',
    description:
      'Creates this map and makes it active immediately — players see it right away.',
  },
]

export function SendToLiveMapButton({
  campaignId,
  preparedMapId,
  hasImage,
  dirty,
}: SendToLiveMapButtonProps) {
  const [open, setOpen] = useState(false)
  const [ctx, setCtx] = useState<DeployContext | null>(null)
  const [loadingCtx, setLoadingCtx] = useState(false)
  const [confirmingReplace, setConfirmingReplace] = useState(false)
  const [busyMode, setBusyMode] = useState<DeployMode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DeployResult | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getLiveMapDeployContext(campaignId, preparedMapId).then((res) => {
      if (cancelled) return
      if ('error' in res) setError(res.error ?? 'Could not load Live Map status.')
      else setCtx(res)
      setLoadingCtx(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, campaignId, preparedMapId])

  function openDialog() {
    setError(null)
    setResult(null)
    setConfirmingReplace(false)
    setCtx(null)
    setLoadingCtx(true)
    setOpen(true)
  }

  function closeDialog() {
    setOpen(false)
    setBusyMode(null)
  }

  async function deploy(mode: DeployMode) {
    setBusyMode(mode)
    setError(null)
    const res = await sendPreparedMapToLiveMap(campaignId, preparedMapId, { mode })
    setBusyMode(null)
    if (res?.error) {
      setError(res.error)
      // A partial success (created but activate failed) still returns an id.
      if ('liveMapId' in res && res.liveMapId) {
        setResult({
          liveMapId: res.liveMapId,
          mode,
          activated: false,
          replacedMapName: null,
        })
      }
      return
    }
    setResult(res as DeployResult)
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={openDialog} disabled={!hasImage}>
        Send to Live Map
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-label="Send to Live Map"
          aria-modal="true"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-canvas shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-semibold text-content">Send to Live Map</h2>
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-md p-1 text-faint hover:bg-panel-raised hover:text-content"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4">
              {dirty && !result && (
                <p className="mb-3 rounded-lg border border-accent/60 bg-accent/20 px-3 py-2 text-sm text-accent">
                  Save your changes first — deploying copies the last saved version.
                </p>
              )}

              {error && (
                <p className="mb-3 rounded-lg border border-red-800/60 bg-red-900/20 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              {/* Success state */}
              {result ? (
                <div className="flex flex-col gap-3">
                  <p className="rounded-lg border border-emerald-800/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-300">
                    {result.activated
                      ? `Now live${result.replacedMapName ? ` — replaced “${result.replacedMapName}”` : ''}. Players see this map now.`
                      : 'Created as a new (inactive) live map. Activate it from Live Map when you’re ready.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/campaigns/${campaignId}/live-map/${result.liveMapId}`}>
                      <Button size="sm">Open in Live Map</Button>
                    </Link>
                    <Button variant="secondary" size="sm" onClick={closeDialog}>
                      Done
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {ctx?.preview && (
                    <div className="rounded-lg border border-border bg-panel p-3">
                      <h3 className="text-sm font-semibold text-content">Deploy preview</h3>
                      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <dt className="text-faint">Visible tokens</dt>
                          <dd className="font-semibold text-emerald-300">{ctx.preview.visibleTokens}</dd>
                        </div>
                        <div>
                          <dt className="text-faint">Hidden/discoverable</dt>
                          <dd className="font-semibold text-accent">{ctx.preview.hiddenOrDiscoverableTokens}</dd>
                        </div>
                        <div>
                          <dt className="text-faint">Rooms</dt>
                          <dd className="font-semibold text-content">{ctx.preview.rooms}</dd>
                        </div>
                        <div>
                          <dt className="text-faint">Fog masks</dt>
                          <dd className="font-semibold text-content">{ctx.preview.fogMasks}</dd>
                        </div>
                        <div>
                          <dt className="text-faint">Transport links</dt>
                          <dd className="font-semibold text-content">{ctx.preview.transportLinks}</dd>
                        </div>
                        <div>
                          <dt className="text-faint">Codex links</dt>
                          <dd className="font-semibold text-content">{ctx.preview.codexLinks}</dd>
                        </div>
                      </dl>
                    </div>
                  )}

                  {MODE_INFO.map((info) => {
                    const isReplace = info.mode === 'replace_active'
                    const deployCount = ctx?.existingDeployCount ?? 0
                    return (
                      <div
                        key={info.mode}
                        className={`rounded-lg border p-3 ${
                          isReplace
                            ? 'border-accent/50 bg-accent/20'
                            : 'border-border bg-panel'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-content">{info.title}</h3>
                            <p className="mt-0.5 text-xs text-muted">{info.description}</p>
                            {info.mode === 'duplicate' && deployCount > 0 && (
                              <p className="mt-1 text-[11px] text-faint">
                                Already deployed {deployCount} time{deployCount === 1 ? '' : 's'} from this prep.
                              </p>
                            )}
                            {isReplace && !loadingCtx && (
                              <p className="mt-1 text-[11px] text-accent/80">
                                {ctx?.activeMapName
                                  ? `Players currently see “${ctx.activeMapName}”. This will swap it out now.`
                                  : 'No map is active yet — this will become the active map.'}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Replace needs an explicit second confirm. */}
                        {isReplace ? (
                          confirmingReplace ? (
                            <div className="mt-2.5 flex items-center gap-2">
                              <Button
                                variant="danger"
                                size="sm"
                                loading={busyMode === 'replace_active'}
                                disabled={dirty || busyMode !== null}
                                onClick={() => deploy('replace_active')}
                              >
                                Replace now
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busyMode !== null}
                                onClick={() => setConfirmingReplace(false)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="mt-2.5">
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={dirty || busyMode !== null}
                                onClick={() => setConfirmingReplace(true)}
                              >
                                Replace…
                              </Button>
                            </div>
                          )
                        ) : (
                          <div className="mt-2.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={busyMode === info.mode}
                              disabled={dirty || busyMode !== null}
                              onClick={() => deploy(info.mode)}
                            >
                              {info.mode === 'duplicate' ? 'Duplicate' : 'Add scene'}
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
