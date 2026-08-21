import { AuthorQuizStatistics } from "@/components/author/author-quiz-statistics";
import { getAuthorQuizStatistics } from "@/db/queries/quizzes";
import { requireAuthor } from "@/lib/auth/author-auth";

export default async function AuthorQuizzesPage() {
  const author = await requireAuthor();
  const statistics = await getAuthorQuizStatistics(author.id);

  return (
    <div className="author-dashboard">
      <AuthorQuizStatistics statistics={statistics} />
    </div>
  );
}
