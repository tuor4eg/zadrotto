export const ARCHIVE_ONBOARDING_GOAL_COUNT = 3
export const ARCHIVE_ONBOARDING_STORAGE_KEY = "zadrotto.archive-onboarding"
export const ARCHIVE_ONBOARDING_RATING_SAVED_EVENT = "zadrotto:rating-saved"
export const ARCHIVE_ONBOARDING_RECORD_FOCUSED_EVENT = "zadrotto:archive-record-focused"
export const USER_HUD_REFRESH_EVENT = "zadrotto:user-hud-refresh"
export const ARCHIVE_ONBOARDING_COACH_MARK_TEXT = "Начни здесь. Поставь свою оценку"
export const ARCHIVE_ONBOARDING_IMAGE_SRC = "/mascot/deadz_map.webp"

export const ARCHIVE_ONBOARDING_STEP_IDS = [
  "start",
  "hint",
  "achievement",
  "progress",
  "complete",
] as const

export type ArchiveOnboardingStepId = (typeof ARCHIVE_ONBOARDING_STEP_IDS)[number]

export type ArchiveOnboardingCard = {
  body: string
  canHide: boolean
  goalCount: number
  imageSrc: string | null
  ratingsCount: number
  showRatingCoachMark: boolean
  stepId: ArchiveOnboardingStepId
  title: string
}

export type ArchiveOnboardingStorageState = {
  acknowledgedStepId: ArchiveOnboardingStepId | null
  completed: boolean
  dismissed: boolean
  firstAchievementSeen: boolean
  started: boolean
}

export const EMPTY_ARCHIVE_ONBOARDING_STORAGE: ArchiveOnboardingStorageState = {
  acknowledgedStepId: null,
  completed: false,
  dismissed: false,
  firstAchievementSeen: false,
  started: false,
}

const RECORD_NOUN = {
  few: "знакомых записи",
  many: "знакомых записей",
  one: "знакомую запись",
} as const

export function isArchiveOnboardingStepId(value: unknown): value is ArchiveOnboardingStepId {
  return typeof value === "string" && ARCHIVE_ONBOARDING_STEP_IDS.includes(value as ArchiveOnboardingStepId)
}

export function isArchiveOnboardingPath(pathname: string) {
  return pathname !== "/admin"
    && !pathname.startsWith("/admin/")
    && pathname !== "/author"
    && !pathname.startsWith("/author/")
}

export function isArchiveOnboardingMediaPath(pathname: string) {
  return /^\/media\/[^/]+$/.test(pathname)
}

export function isArchiveOnboardingRatingPath(pathname: string) {
  return pathname === "/archive" || isArchiveOnboardingMediaPath(pathname)
}

function formatRemainingRecords(remaining: number) {
  const category = new Intl.PluralRules("ru-RU").select(remaining)
  const noun = category === "one" ? RECORD_NOUN.one : category === "few" ? RECORD_NOUN.few : RECORD_NOUN.many
  return `${remaining} ${noun}`
}

function getProgressBody(ratingsCount: number) {
  const remaining = Math.max(0, ARCHIVE_ONBOARDING_GOAL_COUNT - ratingsCount)
  if (ratingsCount <= 1) {
    return `Первая оценка есть. Найди ещё ${formatRemainingRecords(remaining)}.`
  }

  return `Найди ещё ${formatRemainingRecords(remaining)}.`
}

export function canHideArchiveOnboarding(ratingsCount: number) {
  return ratingsCount >= 1
}

export function getArchiveOnboardingCard(input: {
  completed: boolean
  dismissed: boolean
  firstAchievementSeen: boolean
  ratingsCount: number
  recordFocused: boolean
  showFirstAchievement: boolean
  started: boolean
}): ArchiveOnboardingCard | null {
  const ratingsCount = Math.max(0, input.ratingsCount)
  const canHide = canHideArchiveOnboarding(ratingsCount)
  if (input.dismissed) return null
  if (ratingsCount >= ARCHIVE_ONBOARDING_GOAL_COUNT && (!input.started || input.completed)) {
    return null
  }

  const filledCount = Math.min(ratingsCount, ARCHIVE_ONBOARDING_GOAL_COUNT)

  if (ratingsCount >= ARCHIVE_ONBOARDING_GOAL_COUNT) {
    return {
      body: "Три оценки есть. Дальше можно идти своим маршрутом — находи знакомые записи и оценивай их.",
      canHide,
      goalCount: ARCHIVE_ONBOARDING_GOAL_COUNT,
      imageSrc: ARCHIVE_ONBOARDING_IMAGE_SRC,
      ratingsCount: filledCount,
      showRatingCoachMark: false,
      stepId: "complete",
      title: "Архив начат!",
    }
  }

  if (
    ratingsCount === 1
    && input.showFirstAchievement
    && !input.firstAchievementSeen
  ) {
    return {
      body: "Поздравляю — первая ачивка получена. Так архив отмечает твои шаги.",
      canHide: false,
      goalCount: ARCHIVE_ONBOARDING_GOAL_COUNT,
      imageSrc: ARCHIVE_ONBOARDING_IMAGE_SRC,
      ratingsCount: filledCount,
      showRatingCoachMark: false,
      stepId: "achievement",
      title: "Первая ачивка!",
    }
  }

  if (ratingsCount >= 1) {
    return {
      body: getProgressBody(ratingsCount),
      canHide,
      goalCount: ARCHIVE_ONBOARDING_GOAL_COUNT,
      imageSrc: ARCHIVE_ONBOARDING_IMAGE_SRC,
      ratingsCount: filledCount,
      showRatingCoachMark: false,
      stepId: "progress",
      title: "Отлично!",
    }
  }

  if (input.recordFocused) {
    return {
      body: "Поставь свою оценку, это просто!",
      canHide,
      goalCount: ARCHIVE_ONBOARDING_GOAL_COUNT,
      imageSrc: ARCHIVE_ONBOARDING_IMAGE_SRC,
      ratingsCount: filledCount,
      showRatingCoachMark: true,
      stepId: "hint",
      title: "Знакомая запись?",
    }
  }

  return {
    body: "Найди знакомую запись и поставь первую оценку.",
    canHide,
    goalCount: ARCHIVE_ONBOARDING_GOAL_COUNT,
    imageSrc: ARCHIVE_ONBOARDING_IMAGE_SRC,
    ratingsCount: filledCount,
    showRatingCoachMark: false,
    stepId: "start",
    title: "Начни свой архив",
  }
}

export function reconcileArchiveOnboardingStorage(
  current: ArchiveOnboardingStorageState,
  ratingsCount: number,
): ArchiveOnboardingStorageState {
  // Keep explicit "never show again" (dismissed). Only clear stale completed
  // when the author is still below the goal.
  if (ratingsCount < ARCHIVE_ONBOARDING_GOAL_COUNT && current.completed) {
    current = {
      ...current,
      completed: false,
    }
  }
  if (current.completed) return current
  if (!current.started && ratingsCount >= ARCHIVE_ONBOARDING_GOAL_COUNT) {
    return {
      ...current,
      completed: true,
    }
  }
  if (!current.started) {
    return {
      ...current,
      started: true,
    }
  }
  return current
}

export function dismissArchiveOnboardingStorage(
  current: ArchiveOnboardingStorageState,
): ArchiveOnboardingStorageState {
  return {
    ...current,
    dismissed: true,
  }
}

export function acknowledgeArchiveOnboardingStep(
  current: ArchiveOnboardingStorageState,
  stepId: ArchiveOnboardingStepId,
): ArchiveOnboardingStorageState {
  if (stepId === "complete") {
    return {
      ...current,
      completed: true,
      dismissed: true,
    }
  }

  if (stepId === "achievement") {
    return {
      ...current,
      acknowledgedStepId: null,
      firstAchievementSeen: true,
    }
  }

  return {
    ...current,
    acknowledgedStepId: stepId,
  }
}

export function expandArchiveOnboardingStorage(
  current: ArchiveOnboardingStorageState,
): ArchiveOnboardingStorageState {
  return {
    ...current,
    acknowledgedStepId: null,
  }
}
