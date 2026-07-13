'use client'

import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)

  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getSnapshot() {
  return navigator.onLine
}

function getServerSnapshot() {
  return true
}

export function ConnectionStatus() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (online) return null

  return (
    <div
      role="status"
      className="fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-warning/45 bg-overlay/95 px-4 py-2 text-sm font-medium text-warning shadow-2xl backdrop-blur-xl"
    >
      Connection lost. Changes may not save until you are back online.
    </div>
  )
}
