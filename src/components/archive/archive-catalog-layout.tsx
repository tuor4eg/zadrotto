"use client"

import type { ReactNode } from "react"

type ArchiveCatalogLayoutProps = {
  children: ReactNode
  footer?: ReactNode
  preview: ReactNode
  previewKey?: string | number | null
  toolbar?: ReactNode
}

export function ArchiveCatalogLayout({
  children,
  footer,
  preview,
  toolbar,
}: ArchiveCatalogLayoutProps) {
  return (
    <section className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(290px,0.28fr)]">
      <div className="archive-catalog-list-panel archive-textured-block flex min-h-0 min-w-0 flex-col p-4">
        {toolbar}

        <div
          className={`archive-scrollbar grid min-h-0 flex-1 grid-cols-3 content-start gap-2.5 overflow-y-auto pl-1 pr-1 md:grid-cols-4 xl:grid-cols-6 ${
            toolbar ? "mt-2" : ""
          }`}
        >
          {children}
        </div>

        {footer ? <div className="mt-3 pl-1 pr-4">{footer}</div> : null}
      </div>

      <div className="relative hidden min-h-0 min-w-0 xl:block">
        {/* Sticky wrapper stays outside .archive-textured-block: that class forces position:relative. */}
        <div className="xl:sticky xl:top-4 xl:z-20 xl:flex xl:h-[calc(100dvh-1.75rem)] xl:max-h-[calc(100dvh-1.75rem)] xl:self-start">
          <article className="archive-textured-block flex h-full min-h-0 w-full min-w-0 flex-col overflow-visible">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/clip-transparent-trimmed.png"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute -top-3 right-4 z-50 h-20 w-auto object-contain drop-shadow-[0_12px_12px_rgba(28,25,23,0.24)] sm:right-6 sm:h-24"
            />
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {preview}
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
