import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, type LucideIcon } from 'lucide-react'

interface PlayerDestinationCardProps {
  href: string
  title: string
  description: string
  imageSrc: string
  icon: LucideIcon
  live?: boolean
  className?: string
}

export function PlayerDestinationCard({
  href,
  title,
  description,
  imageSrc,
  icon: Icon,
  live = false,
  className = '',
}: PlayerDestinationCardProps) {
  return (
    <Link
      href={href}
      className={`group relative flex min-h-11 flex-col overflow-hidden rounded-2xl border bg-panel shadow-[inset_0_1px_color-mix(in_srgb,var(--theme-content)_3%,transparent)] transition duration-200 hover:-translate-y-0.5 hover:bg-panel-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-shell motion-reduce:transform-none ${
        live
          ? 'border-live/60 ring-1 ring-live/25 hover:border-live'
          : 'border-border hover:border-accent/45'
      } ${className}`}
    >
      <div className="relative h-28 overflow-hidden sm:h-32">
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes="(min-width: 640px) 24rem, 100vw"
          className="object-cover transition duration-300 group-hover:scale-[1.03] motion-reduce:transform-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/20 to-black/5" aria-hidden="true" />
        <span className="absolute bottom-3 left-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-black/45 text-white shadow-lg backdrop-blur-sm">
          <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        </span>
        {live && (
          <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-live/50 bg-black/65 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-live backdrop-blur-sm">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
            </span>
            Live
          </span>
        )}
      </div>

      <div className="flex flex-1 items-center gap-3 px-4 py-3.5">
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-content">{title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-faint">{description}</span>
        </span>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-shell text-accent transition group-hover:border-accent/35 group-hover:bg-accent/10" aria-hidden="true">
          <ArrowRight className="h-5 w-5" />
        </span>
      </div>
    </Link>
  )
}
