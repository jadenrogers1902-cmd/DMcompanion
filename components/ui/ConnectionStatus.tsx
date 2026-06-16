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
    <div className="fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-amber-700 bg-amber-950 px-4 py-2 text-sm font-medium text-amber-100 shadow-lg">
      Connection lost. Changes may not save until you are back online.
    </div>
  )
}
