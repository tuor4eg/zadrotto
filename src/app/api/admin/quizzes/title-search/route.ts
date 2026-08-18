import { getCurrentAdminUser } from "@/lib/auth/admin-auth"
import { searchQuizAnswerTitles } from "@/db/queries/quizzes"
import { isMediaTypeCode } from "@/lib/media/types"

export async function GET(request: Request) {
  if (!(await getCurrentAdminUser())) {
    return Response.json({ error: "Требуется авторизация." }, { status: 401 })
  }

  const searchParams = new URL(request.url).searchParams
  const q = searchParams.get("q") ?? ""
  const mediaTypes = searchParams.getAll("mediaType").filter(isMediaTypeCode)

  return Response.json({ items: await searchQuizAnswerTitles(q, mediaTypes) })
}
