"use client"

import { useEffect, useRef } from "react"

import { importDemoProfileAction } from "@/app/demo-profile/actions"
import { USER_HUD_REFRESH_EVENT } from "@/lib/onboarding/model"
import {
  clearDemoProfileIfSnapshot,
  readDemoProfile,
} from "@/lib/user-state/demo-storage"

const IMPORT_RETRY_DELAYS_MS = [1_000, 3_000] as const
const IMPORT_LONG_RETRY_BASE_MS = 30_000
const IMPORT_LONG_RETRY_MAX_MS = 15 * 60_000

export function getDemoImportRetryDelayMs(attempt: number) {
  if (attempt < IMPORT_RETRY_DELAYS_MS.length) return IMPORT_RETRY_DELAYS_MS[attempt]
  return Math.min(
    IMPORT_LONG_RETRY_BASE_MS * 2 ** (attempt - IMPORT_RETRY_DELAYS_MS.length),
    IMPORT_LONG_RETRY_MAX_MS,
  )
}

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
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
    retryTimeoutRef.current = null

    if (!authenticated || authorId == null) {
      lastAuthorRef.current = null
      return
    }

    if (lastAuthorRef.current === authorId) return
    if (importingRef.current) return

    const importWithRetry = async (attempt: number) => {
      if (cancelled || importingRef.current) return
      const profile = readDemoProfile()
      if (!profile || profile.import.importedAt != null) {
        lastAuthorRef.current = authorId
        return
      }
      const snapshot = JSON.stringify(profile)
      importingRef.current = true
      try {
        const result = await importDemoProfileAction(profile)
        if (cancelled) return
        if (result.ok) {
          if (clearDemoProfileIfSnapshot(snapshot)) {
            lastAuthorRef.current = authorId
            window.dispatchEvent(new Event(USER_HUD_REFRESH_EVENT))
            return
          }
          retryTimeoutRef.current = setTimeout(() => void importWithRetry(0), IMPORT_RETRY_DELAYS_MS[0])
          return
        }
      } catch {
        // Preserve the local profile and retry below.
      } finally {
        importingRef.current = false
      }

      const delay = getDemoImportRetryDelayMs(attempt)
      if (!cancelled) {
        retryTimeoutRef.current = setTimeout(() => void importWithRetry(attempt + 1), delay)
      }
    }
    void importWithRetry(0)

    return () => {
      cancelled = true
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
      importingRef.current = false
    }
  }, [authenticated, authorId])

  return null
}
