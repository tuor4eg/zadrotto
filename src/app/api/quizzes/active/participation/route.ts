import { joinActiveQuiz } from "@/db/queries/quizzes";
import { getCurrentAuthor } from "@/lib/auth/author-auth";

export async function POST() {
  const author = await getCurrentAuthor();
  if (!author) {
    return Response.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const quiz = await joinActiveQuiz(author.id);
  if (!quiz) {
    return Response.json({ error: "Активная викторина не найдена." }, { status: 404 });
  }

  return Response.json({ quizId: quiz.id });
}
