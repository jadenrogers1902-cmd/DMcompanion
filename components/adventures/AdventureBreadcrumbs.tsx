import Link from 'next/link'
import { Fragment } from 'react'

interface Crumb {
  label: string
  href?: string
}

/** Prep-workspace breadcrumb trail: Adventure Maker / Adventure / Chapter. */
export function AdventureBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
      {crumbs.map((crumb, index) => (
        <Fragment key={`${crumb.label}-${index}`}>
          {index > 0 && (
            <svg
              className="h-3.5 w-3.5 shrink-0 text-zinc-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          )}
          {crumb.href ? (
            <Link href={crumb.href} className="text-zinc-500 transition-colors hover:text-zinc-300">
              {crumb.label}
            </Link>
          ) : (
            <span className="font-medium text-zinc-300">{crumb.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}
