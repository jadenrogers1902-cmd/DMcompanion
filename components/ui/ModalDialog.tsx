'use client'

import { type ReactNode, useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface ModalDialogProps {
  children: ReactNode
  labelledBy: string
  describedBy?: string
  onClose: () => void
  position?: 'fixed' | 'absolute'
  overlayClassName?: string
  panelClassName?: string
}

/**
 * Accessible modal shell for the app's lightweight, state-driven dialogs.
 * It keeps keyboard focus inside the open dialog, closes on Escape/backdrop,
 * and returns focus to the control that opened it.
 */
export function ModalDialog({
  children,
  labelledBy,
  describedBy,
  onClose,
  position = 'fixed',
  overlayClassName = '',
  panelClassName = '',
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const dialog = dialogRef.current
    const animationFrame = window.requestAnimationFrame(() => {
      const initialFocus = dialog?.querySelector<HTMLElement>('[data-dialog-initial-focus]')
        ?? dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(initialFocus ?? dialog)?.focus({ preventScroll: true })
    })

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !dialog) return

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => element.getClientRects().length > 0)

      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [])

  return (
    <div
      className={`${position} inset-0 ${overlayClassName}`.trim()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={panelClassName}
      >
        {children}
      </div>
    </div>
  )
}
