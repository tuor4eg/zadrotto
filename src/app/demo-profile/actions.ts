"use server"

import { revalidatePath } from "next/cache"

import { importDemoProfile } from "@/db/operations/demo-profile-import"
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types"
import { getCurrentAuthor } from "@/lib/auth/author-auth"
import { parseDemoProfile } from "@/lib/user-state/demo-profile"

export type ImportDemoProfileResult = {
  importedRatings: number
  importedStatuses: number
  skippedConflicts: number
  ok: true
} | {
  error: string
  ok: false
}

export async function importDemoProfileAction(
  rawProfile: unknown,
): Promise<ImportDemoProfileResult> {
  const author = await getCurrentAuthor()
  if (!author) {
    return { ok: false, error: "Нужно войти в аккаунт." }
  }

  const profile = parseDemoProfile(rawProfile)
  if (!profile || profile.import.importedAt != null) {
    return { ok: false, error: "Demo-профиль не найден или уже импортирован." }
  }

  const accessibleMediaTypeCodes = await getAccessibleMediaTypeCodes(author.id)
  const result = await importDemoProfile({
    accessibleMediaTypeCodes,
    authorId: author.id,
    profile,
  })

  revalidatePath("/")
  revalidatePath("/archive")
  revalidatePath("/author")
  revalidatePath("/achievements")

  return {
    ok: true,
    ...result,
  }
}
