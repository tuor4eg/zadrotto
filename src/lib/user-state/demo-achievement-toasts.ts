export const DEMO_ACHIEVEMENT_TOAST_STORAGE_KEY = "zadrotto.demo-achievement-toasts"

export type DemoAchievementToastState = {
  announcedKeys: string[]
  seeded: boolean
}

const EMPTY_STATE: DemoAchievementToastState = {
  announcedKeys: [],
  seeded: false,
}

export function readDemoAchievementToastState(): DemoAchievementToastState {
  if (typeof window === "undefined") return EMPTY_STATE

  try {
    const raw = window.localStorage.getItem(DEMO_ACHIEVEMENT_TOAST_STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return EMPTY_STATE
    const value = parsed as Record<string, unknown>
    const announcedKeys = Array.isArray(value.announcedKeys)
      ? value.announcedKeys.filter((key): key is string => typeof key === "string")
      : []
    return {
      announcedKeys,
      seeded: value.seeded === true,
    }
  } catch {
    return EMPTY_STATE
  }
}

export function writeDemoAchievementToastState(state: DemoAchievementToastState) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(DEMO_ACHIEVEMENT_TOAST_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Private mode can block storage.
  }
}

export function clearDemoAchievementToastState() {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(DEMO_ACHIEVEMENT_TOAST_STORAGE_KEY)
  } catch {
    // Private mode can block storage.
  }
}
