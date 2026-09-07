import {
  EMPTY_ARCHIVE_ONBOARDING_STORAGE,
  ARCHIVE_ONBOARDING_STORAGE_KEY,
  isArchiveOnboardingStepId,
  type ArchiveOnboardingStorageState,
} from "@/lib/onboarding/model"

export const ARCHIVE_ONBOARDING_STORAGE_EVENT = "zadrotto:archive-onboarding-storage"
export const EMPTY_ARCHIVE_ONBOARDING_STORAGE_SNAPSHOT = JSON.stringify(
  EMPTY_ARCHIVE_ONBOARDING_STORAGE,
)

export function getArchiveOnboardingStorageKey(subject?: number | "demo" | null) {
  if (subject == null) return ARCHIVE_ONBOARDING_STORAGE_KEY
  return `${ARCHIVE_ONBOARDING_STORAGE_KEY}:author:${subject}`
}

export function parseArchiveOnboardingStorage(raw: unknown): ArchiveOnboardingStorageState {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_ARCHIVE_ONBOARDING_STORAGE }
  }

  const value = raw as Record<string, unknown>

  return {
    acknowledgedStepId: isArchiveOnboardingStepId(value.acknowledgedStepId)
      ? value.acknowledgedStepId
      : null,
    completed: value.completed === true,
    dismissed: value.dismissed === true,
    firstAchievementSeen: value.firstAchievementSeen === true,
    started: value.started === true,
  }
}

export function readArchiveOnboardingStorage(subject?: number | "demo" | null): ArchiveOnboardingStorageState {
  if (typeof window === "undefined") {
    return { ...EMPTY_ARCHIVE_ONBOARDING_STORAGE }
  }

  try {
    const raw = window.localStorage.getItem(getArchiveOnboardingStorageKey(subject))
    if (!raw) return { ...EMPTY_ARCHIVE_ONBOARDING_STORAGE }
    return parseArchiveOnboardingStorage(JSON.parse(raw) as unknown)
  } catch {
    return { ...EMPTY_ARCHIVE_ONBOARDING_STORAGE }
  }
}

export function getArchiveOnboardingStorageSnapshot(subject?: number | "demo" | null) {
  return JSON.stringify(readArchiveOnboardingStorage(subject))
}

export function subscribeArchiveOnboardingStorage(onStoreChange: () => void) {
  window.addEventListener(ARCHIVE_ONBOARDING_STORAGE_EVENT, onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    window.removeEventListener(ARCHIVE_ONBOARDING_STORAGE_EVENT, onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

export function writeArchiveOnboardingStorage(
  state: ArchiveOnboardingStorageState,
  subject?: number | "demo" | null,
) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(getArchiveOnboardingStorageKey(subject), JSON.stringify(state))
    window.dispatchEvent(new Event(ARCHIVE_ONBOARDING_STORAGE_EVENT))
  } catch {
    // Private mode can block storage; dismiss then lasts for this session only.
  }
}