import {
  createEmptyDemoProfile,
  DEMO_ONBOARDING_STORAGE_AUTHOR_KEY,
  DEMO_PROFILE_STORAGE_EVENT,
  DEMO_PROFILE_STORAGE_KEY,
  parseDemoProfile,
  type DemoProfile,
} from "@/lib/user-state/demo-profile"

import { DEMO_ACHIEVEMENT_TOAST_STORAGE_KEY } from "@/lib/user-state/demo-achievement-toasts"
import {
  ARCHIVE_ONBOARDING_STORAGE_EVENT,
  getArchiveOnboardingStorageKey,
} from "@/lib/onboarding/storage"

export const EMPTY_DEMO_PROFILE_SNAPSHOT = "null"

export function readDemoProfile(): DemoProfile | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(DEMO_PROFILE_STORAGE_KEY)
    if (!raw) return null
    return parseDemoProfile(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function getDemoProfileSnapshot() {
  const profile = readDemoProfile()
  return profile ? JSON.stringify(profile) : EMPTY_DEMO_PROFILE_SNAPSHOT
}

export function subscribeDemoProfile(onStoreChange: () => void) {
  window.addEventListener(DEMO_PROFILE_STORAGE_EVENT, onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    window.removeEventListener(DEMO_PROFILE_STORAGE_EVENT, onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

export function writeDemoProfile(profile: DemoProfile) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(DEMO_PROFILE_STORAGE_KEY, JSON.stringify(profile))
    window.dispatchEvent(new Event(DEMO_PROFILE_STORAGE_EVENT))
  } catch {
    // Private mode can block storage.
  }
}

export function clearDemoProfile() {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(DEMO_PROFILE_STORAGE_KEY)
    window.localStorage.removeItem(DEMO_ACHIEVEMENT_TOAST_STORAGE_KEY)
    window.localStorage.removeItem(
      getArchiveOnboardingStorageKey(DEMO_ONBOARDING_STORAGE_AUTHOR_KEY),
    )
    window.dispatchEvent(new Event(DEMO_PROFILE_STORAGE_EVENT))
    window.dispatchEvent(new Event(ARCHIVE_ONBOARDING_STORAGE_EVENT))
  } catch {
    // Private mode can block storage.
  }
}

export function ensureDemoProfile(): DemoProfile {
  const existing = readDemoProfile()
  if (existing && existing.import.importedAt == null) return existing

  // A previous import may have happened before guest onboarding became part of
  // the demo cleanup. Start every genuinely new guest history from a clean slate.
  clearDemoProfile()
  const profile = createEmptyDemoProfile()
  writeDemoProfile(profile)
  return profile
}

export function hasActiveDemoProfile() {
  const profile = readDemoProfile()
  return Boolean(profile && profile.import.importedAt == null)
}
