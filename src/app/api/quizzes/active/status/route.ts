import { getActiveQuizParticipantState } from "@/db/queries/quizzes";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

export async function GET() {
  const author = await getCurrentAuthor();
  if (!author) return Response.json({ participant: null });
  return Response.json({ participant: await getActiveQuizParticipantState(author.id) });
}
