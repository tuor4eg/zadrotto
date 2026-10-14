import {
  getDemoRatingsCount,
  getDemoRatedCodes,
  hasDemoRating,
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

  if (hasDemoRating(profile, mediaItemCode)) {
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

  if (hasDemoRating(profile, mediaItemCode)) {
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
  return getDemoRatedCodes(profile)
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

export function upsertDemoPartRating(mediaItemCode: string, partId: number, score: number) {
  if (!Number.isSafeInteger(partId) || partId < 1) throw new Error("Некорректная часть записи")
  if (!Number.isInteger(score) || score < 10 || score > 100 || score % 10 !== 0) throw new Error("Некорректная оценка")
  const profile = readDemoProfile()
  if (!profile || profile.import.importedAt != null) throw new Error("Demo profile is not active")
  const statuses = { ...profile.statuses }
  delete statuses[mediaItemCode]
  return touch({ ...profile, statuses, partRatings: {
    ...profile.partRatings,
    [mediaItemCode]: { ...profile.partRatings[mediaItemCode], [partId]: { score, updatedAt: new Date().toISOString() } },
  } })
}

export function deleteDemoPartRating(mediaItemCode: string, partId: number) {
  const profile = readDemoProfile()
  if (!profile || profile.import.importedAt != null) throw new Error("Demo profile is not active")
  const parts = { ...profile.partRatings[mediaItemCode] }
  delete parts[partId]
  const partRatings = { ...profile.partRatings }
  if (Object.keys(parts).length) partRatings[mediaItemCode] = parts
  else delete partRatings[mediaItemCode]
  return touch({ ...profile, partRatings })
}

export function getDemoPartRating(mediaItemCode: string, partId: number, profile = readDemoProfile()) {
  return profile?.partRatings[mediaItemCode]?.[partId] ?? null
}
