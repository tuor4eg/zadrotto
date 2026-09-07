import { getAuthorRatingsCount } from "@/db/queries/ratings";
import { getActiveQuizParticipantState } from "@/db/queries/quizzes";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

export async function GET() {
  const author = await getCurrentAuthor();
  if (!author) {
    return Response.json({
      authenticated: false,
      authorId: null,
      quizParticipant: null,
      ratingsCount: 0,
    });
  }

  const [quizParticipant, ratingsCount] = await Promise.all([
    getActiveQuizParticipantState(author.id),
    getAuthorRatingsCount(author.id),
  ]);

  return Response.json({
    authenticated: true,
    authorId: author.id,
    quizParticipant,
    ratingsCount,
  });
}
