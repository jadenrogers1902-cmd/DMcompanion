'use client'

import { useState, type ReactNode } from 'react'

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

  return (
    <div>
      <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`
              relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors
              ${
                active === tab.id
                  ? 'text-amber-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }
            `.trim()}
          >
            <span className="flex items-center gap-2">
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="text-xs bg-zinc-800 text-zinc-400 rounded-full px-1.5 py-0.5 min-w-5 text-center">
                  {tab.badge}
                </span>
              )}
            </span>
            {active === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400" />
            )}
          </button>
        ))}
      </div>
      <div className="pt-5">
        {tabs.find((t) => t.id === active)?.content}
      </div>
    </div>
  )
}
