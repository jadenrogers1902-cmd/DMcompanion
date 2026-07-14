'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { safePlayerImageUrl } from '@/lib/utils/player-media'

interface PlayerContentDisclosureProps {
  preview: string | null | undefined
  children: ReactNode
  label?: string
  emptyPreview?: string
}

/**
 * Keeps player-facing cards quick to scan without dropping any of their original
 * content. Native details/summary supplies keyboard and screen-reader semantics.
 */
export function PlayerContentDisclosure({
  preview,
  children,
  label = 'Read full entry',
  emptyPreview = 'No additional details have been shared yet.',
}: PlayerContentDisclosureProps) {
  const previewText = preview?.trim() || emptyPreview

  return (
    <details className="group mt-3">
      <summary className="-mx-1 cursor-pointer list-none rounded-lg px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <span className="block line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted group-open:hidden">
          {previewText}
        </span>
        <span className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-accent group-open:mt-0">
          <span className="group-open:hidden">{label}</span>
          <span className="hidden group-open:inline">Hide details</span>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </span>
      </summary>
      <div className="border-t border-border pt-3 text-sm leading-6 text-muted">
        {children}
      </div>
    </details>
  )
}

interface PlayerMediaThumbnailProps {
  src: string | null | undefined
  alt: string
  fallbackIcon: LucideIcon
  className?: string
}

/**
 * Renders only URLs approved for player-facing media. Arbitrary, invalid, and
 * failed image URLs resolve to a category icon without leaving a broken image.
 */
export function PlayerMediaThumbnail({
  src,
  alt,
  fallbackIcon: FallbackIcon,
  className = 'h-16 w-16',
}: PlayerMediaThumbnailProps) {
  const safeSrc = safePlayerImageUrl(src)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = safeSrc !== null && failedSrc !== safeSrc

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl border border-border bg-canvas ${className}`}
    >
      {showImage ? (
        // Signed Storage URLs and user-configured portrait URLs are dynamic, so
        // the Next image optimizer cannot safely preconfigure their path here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safeSrc}
          alt={alt}
          width={160}
          height={160}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(safeSrc)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-accent" aria-hidden="true">
          <FallbackIcon className="h-6 w-6" strokeWidth={1.75} />
        </span>
      )}
    </div>
  )
}
