import { hasActiveDemoProfile } from "@/lib/user-state/demo-storage"
import type { UserStateMode } from "@/lib/user-state/demo-profile"

export function resolveUserStateMode(input: {
  authenticated: boolean
}): UserStateMode {
  if (input.authenticated) return "authorized"
  if (typeof window !== "undefined" && hasActiveDemoProfile()) return "demo"
  return "plain"
}

export function isDemoUserStateMode(mode: UserStateMode) {
  return mode === "demo"
}

export function canUsePersonalArchiveActions(mode: UserStateMode) {
  return mode === "demo" || mode === "authorized"
}
