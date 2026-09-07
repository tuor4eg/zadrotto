"use client"

import { useMemo, useSyncExternalStore } from "react"

import {
  getDemoRatingsCount,
  parseDemoProfile,
  type DemoProfile,
} from "@/lib/user-state/demo-profile"
import { resolveUserStateMode } from "@/lib/user-state/mode"
import {
  EMPTY_DEMO_PROFILE_SNAPSHOT,
  getDemoProfileSnapshot,
  subscribeDemoProfile,
} from "@/lib/user-state/demo-storage"

export function useDemoProfile() {
  const snapshot = useSyncExternalStore(
    subscribeDemoProfile,
    getDemoProfileSnapshot,
    () => EMPTY_DEMO_PROFILE_SNAPSHOT,
  )

  return useMemo(() => {
    if (snapshot === EMPTY_DEMO_PROFILE_SNAPSHOT) return null
    try {
      return parseDemoProfile(JSON.parse(snapshot) as unknown)
    } catch {
      return null
    }
  }, [snapshot])
}

export function useUserStateMode(authenticated: boolean) {
  const profile = useDemoProfile()
  return useMemo(() => {
    if (authenticated) return "authorized" as const
    if (profile && profile.import.importedAt == null) return "demo" as const
    return resolveUserStateMode({ authenticated: false })
  }, [authenticated, profile])
}

export function useDemoRatingsCount() {
  const profile = useDemoProfile()
  return profile ? getDemoRatingsCount(profile) : 0
}

export type { DemoProfile }
