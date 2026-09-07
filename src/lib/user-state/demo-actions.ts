import {
  getDemoRatingsCount,
  type DemoProfile,
  type DemoRatingEntry,
  type DemoStatusEntry,
} from "@/lib/user-state/demo-profile"
import { readDemoProfile, writeDemoProfile } from "@/lib/user-state/demo-storage"

function touch(profile: DemoProfile) {
  writeDemoProfile(profile)
  return profile
}

export function upsertDemoRating(
  mediaItemCode: string,
  score: number,
  experience?: DemoRatingEntry["experience"] | null,
) {
  const profile = readDemoProfile()
  if (!profile || profile.import.importedAt != null) {
    throw new Error("Demo profile is not active")
  }

  const previous = profile.ratings[mediaItemCode]
  const nextExperience =
    experience === undefined
      ? previous?.experience
      : experience ?? undefined

  const nextStatuses = { ...profile.statuses }
  delete nextStatuses[mediaItemCode]
  const next: DemoProfile = {
    ...profile,
    ratings: {
      ...profile.ratings,
      [mediaItemCode]: {
        score,
        updatedAt: new Date().toISOString(),
        ...(nextExperience ? { experience: nextExperience } : {}),
      },
    },
    statuses: nextStatuses,
  }
  return touch(next)
}

export function deleteDemoRating(mediaItemCode: string) {
  const profile = readDemoProfile()
  if (!profile || profile.import.importedAt != null) {
    throw new Error("Demo profile is not active")
  }

  if (!profile.ratings[mediaItemCode]) return profile

  const nextRatings = { ...profile.ratings }
  delete nextRatings[mediaItemCode]
  return touch({ ...profile, ratings: nextRatings })
}

export function setDemoStatus(mediaItemCode: string, status: DemoStatusEntry["status"]) {
  const profile = readDemoProfile()
  if (!profile || profile.import.importedAt != null) {
    throw new Error("Demo profile is not active")
  }

  if (profile.ratings[mediaItemCode]) {
    throw new Error("Статус доступен только для записи без вашей оценки")
  }

  return touch({
    ...profile,
    statuses: {
      ...profile.statuses,
      [mediaItemCode]: {
        status,
        updatedAt: new Date().toISOString(),
      },
    },
  })
}

export function clearDemoStatus(mediaItemCode: string) {
  const profile = readDemoProfile()
  if (!profile || profile.import.importedAt != null) {
    throw new Error("Demo profile is not active")
  }

  if (!profile.statuses[mediaItemCode]) return profile

  const nextStatuses = { ...profile.statuses }
  delete nextStatuses[mediaItemCode]
  return touch({ ...profile, statuses: nextStatuses })
}

export function toggleDemoStatus(mediaItemCode: string, status: DemoStatusEntry["status"]) {
  const profile = readDemoProfile()
  if (!profile || profile.import.importedAt != null) {
    throw new Error("Demo profile is not active")
  }

  if (profile.ratings[mediaItemCode]) {
    throw new Error("Статус доступен только для записи без вашей оценки")
  }

  if (profile.statuses[mediaItemCode]?.status === status) {
    return clearDemoStatus(mediaItemCode)
  }

  return setDemoStatus(mediaItemCode, status)
}

export function recordDemoLoginPromptShown(profile = readDemoProfile()) {
  if (!profile || profile.import.importedAt != null) return null
  return touch({
    ...profile,
    loginPrompt: {
      ...profile.loginPrompt,
      lastShownAt: new Date().toISOString(),
    },
  })
}

export function dismissDemoLoginPrompt(profile = readDemoProfile()) {
  if (!profile || profile.import.importedAt != null) return null
  return touch({
    ...profile,
    loginPrompt: {
      dismissCount: profile.loginPrompt.dismissCount + 1,
      lastShownAt: new Date().toISOString(),
    },
  })
}

export function getDemoRating(mediaItemCode: string, profile = readDemoProfile()) {
  if (!profile) return null
  return profile.ratings[mediaItemCode] ?? null
}

export function getDemoStatus(mediaItemCode: string, profile = readDemoProfile()) {
  if (!profile) return null
  return profile.statuses[mediaItemCode] ?? null
}

export function listDemoRatedCodes(profile = readDemoProfile()) {
  if (!profile) return [] as string[]
  return Object.keys(profile.ratings)
}

export function listDemoStatusCodes(
  status: DemoStatusEntry["status"],
  profile = readDemoProfile(),
) {
  if (!profile) return [] as string[]
  return Object.entries(profile.statuses)
    .filter(([, entry]) => entry.status === status)
    .map(([code]) => code)
}

export { getDemoRatingsCount }
