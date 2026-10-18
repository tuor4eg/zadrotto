"use client"

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

type ArchiveMediaItemIdentityLayoutProps = {
  breadcrumb: ReactNode
  children: ReactNode
  footer?: ReactNode
  cover: ReactNode
}

export function ArchiveMediaItemIdentityLayout({
  breadcrumb,
  children,
  footer,
  cover,
}: ArchiveMediaItemIdentityLayoutProps) {
  const breadcrumbRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const hasFooter = Boolean(footer)
  const [coverHeight, setCoverHeight] = useState<number | null>(null)

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

  return (
    <header className="relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 sm:gap-x-4">
      <div ref={breadcrumbRef} className="col-span-2 min-w-0 sm:col-start-2 sm:row-start-1">{breadcrumb}</div>
      <div
        className="col-start-1 row-start-2 w-[min(40vw,calc(var(--identity-cover-height)*2/3))] shrink-0 sm:row-span-3 sm:row-start-1"
        style={{ "--identity-cover-height": `${coverHeight ?? 176}px` } as CSSProperties}
      >
        {cover}
      </div>

      <div ref={bodyRef} className="col-start-2 row-start-2 min-w-0">
        {children}
      </div>

      {footer ? <div ref={footerRef} className="col-span-2 row-start-3 min-w-0 sm:col-start-2">{footer}</div> : null}
    </header>
  )
}
