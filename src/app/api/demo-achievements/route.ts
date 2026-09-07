import { getDemoRatingAchievementCatalog, getDemoRatingAchievementState } from "@/db/queries/achievements"

function readMediaItemCodes(body: unknown) {
  if (!body || typeof body !== "object") return [] as string[]
  const raw = (body as { mediaItemCodes?: unknown }).mediaItemCodes
  if (!Array.isArray(raw)) return [] as string[]
  return raw.filter((code): code is string => typeof code === "string" && code.trim() !== "")
}

export async function GET() {
  const catalog = await getDemoRatingAchievementCatalog()
  return Response.json({ achievements: catalog })
}

export async function POST(request: Request) {
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const state = await getDemoRatingAchievementState(readMediaItemCodes(body))
  return Response.json(state)
}
