"use client"

import { ImageViewer } from "@/components/ui/image-viewer"
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

type ArchiveMediaItemIdentityLayoutProps = {
  breadcrumb: ReactNode
  children: ReactNode
  footer?: ReactNode
  coverUrl: string | null
  title: string
  viewerCoverUrl?: string | null
}

export function ArchiveMediaItemIdentityLayout({
  breadcrumb,
  children,
  footer,
  coverUrl,
  title,
  viewerCoverUrl,
}: ArchiveMediaItemIdentityLayoutProps) {
  const breadcrumbRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const hasFooter = Boolean(footer)
  const [coverHeight, setCoverHeight] = useState<number | null>(null)
  const fullCoverUrl = viewerCoverUrl ?? coverUrl

  useLayoutEffect(() => {
    const breadcrumbNode = breadcrumbRef.current
    const bodyNode = bodyRef.current
    const footerNode = footerRef.current
    if (!breadcrumbNode || !bodyNode) return

    const desktopQuery = window.matchMedia("(min-width: 640px)")
    const updateHeight = () => {
      const bodyHeight = bodyNode.getBoundingClientRect().height
      const nextHeight = desktopQuery.matches
        ? breadcrumbNode.getBoundingClientRect().height
          + bodyHeight
          + (footerNode?.getBoundingClientRect().height ?? 0)
          + (hasFooter ? 24 : 12)
        : bodyHeight
      const roundedHeight = Math.round(nextHeight)
      setCoverHeight(roundedHeight > 0 ? roundedHeight : null)
    }

    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(breadcrumbNode)
    observer.observe(bodyNode)
    if (footerNode) observer.observe(footerNode)
    desktopQuery.addEventListener("change", updateHeight)
    return () => {
      observer.disconnect()
      desktopQuery.removeEventListener("change", updateHeight)
    }
  }, [hasFooter])

  const coverFrameStyle = coverHeight
    ? ({ "--identity-cover-height": coverHeight + "px" } as CSSProperties)
    : undefined
  const coverImage = coverUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverUrl}
      alt={`Обложка: ${title}`}
      className="block h-full w-auto max-w-full object-contain object-left"
    />
  ) : (
    <span
      aria-hidden="true"
      className="block h-full bg-[radial-gradient(circle_at_50%_28%,#fff8e8_0,#ead8b7_42%,#bfa277_100%)]"
      style={{
        height: coverHeight ?? 176,
        width: Math.round((coverHeight ?? 176) * (2 / 3)),
      }}
    />
  )

  const coverFrameClassName =
    "block h-[var(--identity-cover-height)] w-fit max-w-[40vw] overflow-hidden rounded-md border border-stone-400/35 bg-stone-200/80 shadow-[0_2px_6px_rgba(28,25,23,0.14)]"

  return (
    <header className="relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 sm:gap-x-4">
      <div ref={breadcrumbRef} className="col-span-2 min-w-0 sm:col-start-2 sm:row-start-1">{breadcrumb}</div>
      {fullCoverUrl ? (
        <ImageViewer
          src={fullCoverUrl}
          alt={`Обложка: ${title}`}
          title={title}
          triggerClassName="media-image-lift-trigger col-start-1 row-start-2 shrink-0 cursor-zoom-in border-0 bg-transparent p-0 text-left sm:row-span-3 sm:row-start-1"
        >
          <span className={coverFrameClassName} style={coverFrameStyle}>
            {coverImage}
          </span>
        </ImageViewer>
      ) : (
        <div className={`col-start-1 row-start-2 shrink-0 sm:row-span-3 sm:row-start-1 ${coverFrameClassName}`} style={coverFrameStyle}>
          {coverImage}
        </div>
      )}

      <div ref={bodyRef} className="col-start-2 row-start-2 min-w-0">
        {children}
      </div>

      {footer ? <div ref={footerRef} className="col-span-2 row-start-3 min-w-0 sm:col-start-2">{footer}</div> : null}
    </header>
  )
}
