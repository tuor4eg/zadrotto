export const DEMO_PROFILE_STORAGE_KEY = "zadrotto.demo-profile"
export const DEMO_PROFILE_STORAGE_EVENT = "zadrotto:demo-profile"
export const DEMO_PROFILE_SCHEMA_VERSION = 1
export const DEMO_LOGIN_PROMPT_RATING_THRESHOLD = 12
export const DEMO_ONBOARDING_STORAGE_AUTHOR_KEY = "demo"

export type UserStateMode = "plain" | "demo" | "authorized"

export type DemoRatingExperience = {
  experiencedAt: string | null
  precision: "year" | "month" | "day" | null
}

export type DemoRatingEntry = {
  experience?: DemoRatingExperience
  score: number
  updatedAt: string
}

export type DemoStatusEntry = {
  status: "wanted" | "skipped"
  updatedAt: string
}

export type DemoLoginPromptState = {
  dismissCount: number
  lastShownAt: string | null
}

export type DemoImportState = {
  importedAt: string | null
  importedToAuthorId: number | null
}

export type DemoProfile = {
  createdAt: string
  import: DemoImportState
  interests: {
    mediaTypeOverrides: Record<string, boolean>
  }
  loginPrompt: DemoLoginPromptState
  ratings: Record<string, DemoRatingEntry>
  schemaVersion: number
  statuses: Record<string, DemoStatusEntry>
}

export function createEmptyDemoProfile(now = new Date().toISOString()): DemoProfile {
  return {
    createdAt: now,
    import: {
      importedAt: null,
      importedToAuthorId: null,
    },
    interests: {
      mediaTypeOverrides: {},
    },
    loginPrompt: {
      dismissCount: 0,
      lastShownAt: null,
    },
    ratings: {},
    schemaVersion: DEMO_PROFILE_SCHEMA_VERSION,
    statuses: {},
  }
}

function isScore(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 10
    && value <= 100
    && value % 10 === 0
}

function parseDemoExperience(raw: unknown): DemoRatingExperience | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const value = raw as Record<string, unknown>
  if (typeof value.experiencedAt !== "string") return undefined
  const precision = value.precision
  const patterns = {
    year: /^\d{4}-01-01$/,
    month: /^\d{4}-(0[1-9]|1[0-2])-01$/,
    day: /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/,
  } as const
  if (precision !== "year" && precision !== "month" && precision !== "day") return undefined
  if (!patterns[precision].test(value.experiencedAt)) return undefined
  const [year, month, day] = value.experiencedAt.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return undefined
  return { experiencedAt: value.experiencedAt, precision }
}

function parseRatingEntry(raw: unknown): DemoRatingEntry | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  if (!isScore(value.score) || typeof value.updatedAt !== "string") return null

  const entry: DemoRatingEntry = {
    score: value.score,
    updatedAt: value.updatedAt,
  }

  const experience = parseDemoExperience(value.experience)
  if (experience) entry.experience = experience

  return entry
}

function parseStatusEntry(raw: unknown): DemoStatusEntry | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  if (
    (value.status !== "wanted" && value.status !== "skipped")
    || typeof value.updatedAt !== "string"
  ) {
    return null
  }

  return {
    status: value.status,
    updatedAt: value.updatedAt,
  }
}

export function parseDemoProfile(raw: unknown): DemoProfile | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  // Unknown versions require an explicit migration. Silently interpreting a
  // future shape as the current one can corrupt or discard local demo data.
  if (value.schemaVersion !== DEMO_PROFILE_SCHEMA_VERSION) return null

  const base = createEmptyDemoProfile(
    typeof value.createdAt === "string" ? value.createdAt : undefined,
  )

  const ratings: Record<string, DemoRatingEntry> = {}
  if (value.ratings && typeof value.ratings === "object") {
    for (const [mediaItemId, entry] of Object.entries(value.ratings as Record<string, unknown>)) {
      const parsed = parseRatingEntry(entry)
      if (parsed) ratings[mediaItemId] = parsed
    }
  }

  const statuses: Record<string, DemoStatusEntry> = {}
  if (value.statuses && typeof value.statuses === "object") {
    for (const [mediaItemId, entry] of Object.entries(value.statuses as Record<string, unknown>)) {
      const parsed = parseStatusEntry(entry)
      if (parsed && !ratings[mediaItemId]) statuses[mediaItemId] = parsed
    }
  }

  const mediaTypeOverrides: Record<string, boolean> = {}
  const interests = value.interests
  if (interests && typeof interests === "object") {
    const overrides = (interests as Record<string, unknown>).mediaTypeOverrides
    if (overrides && typeof overrides === "object") {
      for (const [code, enabled] of Object.entries(overrides as Record<string, unknown>)) {
        if (typeof enabled === "boolean") mediaTypeOverrides[code] = enabled
      }
    }
  }

  const loginPromptRaw = value.loginPrompt
  const loginPrompt = loginPromptRaw && typeof loginPromptRaw === "object"
    ? {
      dismissCount: typeof (loginPromptRaw as Record<string, unknown>).dismissCount === "number"
        ? Math.max(0, Math.floor((loginPromptRaw as Record<string, unknown>).dismissCount as number))
        : 0,
      lastShownAt: typeof (loginPromptRaw as Record<string, unknown>).lastShownAt === "string"
        ? (loginPromptRaw as Record<string, unknown>).lastShownAt as string
        : null,
    }
    : base.loginPrompt

  const importRaw = value.import
  const importState = importRaw && typeof importRaw === "object"
    ? {
      importedAt: typeof (importRaw as Record<string, unknown>).importedAt === "string"
        ? (importRaw as Record<string, unknown>).importedAt as string
        : null,
      importedToAuthorId: typeof (importRaw as Record<string, unknown>).importedToAuthorId === "number"
        ? (importRaw as Record<string, unknown>).importedToAuthorId as number
        : null,
    }
    : base.import

  return {
    createdAt: base.createdAt,
    import: importState,
    interests: { mediaTypeOverrides },
    loginPrompt,
    ratings,
    schemaVersion: DEMO_PROFILE_SCHEMA_VERSION,
    statuses,
  }
}

export function getDemoRatingsCount(profile: DemoProfile) {
  return Object.keys(profile.ratings).length
}

export function shouldShowDemoLoginPrompt(
  profile: DemoProfile,
  now = Date.now(),
) {
  const ratingsCount = getDemoRatingsCount(profile)
  if (ratingsCount < DEMO_LOGIN_PROMPT_RATING_THRESHOLD) return false

  const { dismissCount, lastShownAt } = profile.loginPrompt
  if (!lastShownAt) return true

  const lastShownMs = Date.parse(lastShownAt)
  if (!Number.isFinite(lastShownMs)) return true

  const dayMs = 24 * 60 * 60 * 1000
  const intervalMs = Math.min(7 * dayMs, dayMs * (2 ** dismissCount))
  return now - lastShownMs >= intervalMs
}
