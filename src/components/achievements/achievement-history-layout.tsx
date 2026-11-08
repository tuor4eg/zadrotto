"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { AchievementAwardHistory } from "./achievement-award-history"
import type { AchievementShowcaseItem } from "./achievement-card"

export function AchievementHistoryLayout({ items, children }: { items: AchievementShowcaseItem[]; children: ReactNode }) {
  const galleryRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    const gallery = galleryRef.current
    if (!gallery) return
    const desktop = window.matchMedia("(min-width: 1024px)")
    const measure = () => setHeight(desktop.matches ? gallery.getBoundingClientRect().height : 480)
    const observer = new ResizeObserver(measure)
    observer.observe(gallery)
    desktop.addEventListener("change", measure)
    measure()
    return () => { observer.disconnect(); desktop.removeEventListener("change", measure) }
  }, [])

  return <div className="grid min-h-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,24rem)]">
    <div ref={galleryRef} className="min-w-0">{children}</div>
    <AchievementAwardHistory items={items} maxHeight={height} />
  </div>
}
