import { getDemoHomeStatisticsMediaItems } from "@/db/queries/demo-home-statistics"

function readMediaItemCodes(body: unknown) {
  if (!body || typeof body !== "object") return [] as unknown[]
  const raw = (body as { mediaItemCodes?: unknown }).mediaItemCodes
  return Array.isArray(raw) ? raw : []
}

export async function POST(request: Request) {
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const items = await getDemoHomeStatisticsMediaItems(readMediaItemCodes(body))
  return Response.json({ items })
}
