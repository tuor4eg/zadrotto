import { getActiveQuizParticipantState } from "@/db/queries/quizzes";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

export async function GET() {
  const author = await getCurrentAuthor();
  if (!author) return Response.json({ authenticated: false, quizParticipant: null });

  return Response.json({
    authenticated: true,
    quizParticipant: await getActiveQuizParticipantState(author.id),
  });
}
