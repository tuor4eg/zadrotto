"use client"

import { useEffect, useRef } from "react"

import { importDemoProfileAction } from "@/app/demo-profile/actions"
import { USER_HUD_REFRESH_EVENT } from "@/lib/onboarding/model"
import { clearDemoProfile, readDemoProfile } from "@/lib/user-state/demo-storage"

/**
 * After any successful auth (password, register, legacy token), import the local
 * demo profile once and delete it. Account data wins on conflicts.
 */
export function DemoProfileImportBridge({
  authenticated,
  authorId,
}: {
  authenticated: boolean
  authorId: number | null
}) {
  const importingRef = useRef(false)
  const lastAuthorRef = useRef<number | null>(null)

  useEffect(() => {
    if (!authenticated || authorId == null) {
      lastAuthorRef.current = null
      return
    }

    if (lastAuthorRef.current === authorId) return
    lastAuthorRef.current = authorId

    const profile = readDemoProfile()
    if (!profile || profile.import.importedAt != null) return
    if (importingRef.current) return

    importingRef.current = true
    void importDemoProfileAction(profile)
      .then((result) => {
        if (result.ok) {
          clearDemoProfile()
          window.dispatchEvent(new Event(USER_HUD_REFRESH_EVENT))
        }
      })
      .finally(() => {
        importingRef.current = false
      })
  }, [authenticated, authorId])

  return null
}
