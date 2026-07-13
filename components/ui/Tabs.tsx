'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

interface Tab {
  id: string
  label: string
  badge?: number
  content: ReactNode
}

interface TabsProps {
  tabs: Tab[]
  defaultTab?: string
}

export function Tabs({ tabs, defaultTab }: TabsProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id)
  const baseId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null

    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = tabs.length - 1

    if (nextIndex === null) return
    event.preventDefault()
    setActive(tabs[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  const activeTab = tabs.find((tab) => tab.id === active)

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sections"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => { tabRefs.current[index] = node }}
            id={`${baseId}-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={active === tab.id}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`
              relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors
              ${
                active === tab.id
                  ? 'text-accent'
                  : 'text-faint hover:bg-hover/55 hover:text-muted'
              }
            `.trim()}
          >
            <span className="flex items-center gap-2">
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="min-w-5 rounded-full border border-border bg-control px-1.5 py-0.5 text-center text-xs text-muted">
                  {tab.badge}
                </span>
              )}
            </span>
            {active === tab.id && (
              <span className="absolute right-0 bottom-0 left-0 h-0.5 bg-accent shadow-[0_0_10px_rgb(184_167_255/0.6)]" />
            )}
          </button>
        ))}
      </div>
      <div
        id={activeTab ? `${baseId}-panel-${activeTab.id}` : undefined}
        role="tabpanel"
        aria-labelledby={activeTab ? `${baseId}-tab-${activeTab.id}` : undefined}
        tabIndex={0}
        className="pt-5 outline-none"
      >
        {activeTab?.content}
      </div>
    </div>
  )
}
