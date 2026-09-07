"use client"

import { useRouter } from "next/navigation"
import { useSyncExternalStore } from "react"

import { ensureDemoProfile, hasActiveDemoProfile, subscribeDemoProfile } from "@/lib/user-state/demo-storage"

export function StartDemoHistoryButton({
  authenticated = false,
  className,
}: {
  authenticated?: boolean
  className?: string
}) {
  const router = useRouter()
  const hasDemo = useSyncExternalStore(
    subscribeDemoProfile,
    hasActiveDemoProfile,
    () => false,
  )
  const label = !authenticated && hasDemo ? "Продолжить историю" : "Начать историю"

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (authenticated) {
          router.push("/archive")
          return
        }

        ensureDemoProfile()
        router.push("/archive")
      }}
    >
      {label}
    </button>
  )
}
