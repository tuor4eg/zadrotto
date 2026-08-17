import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { checkQuizGuess } from "@/db/queries/quizzes";

export async function POST(request: Request) {
  const author = await getCurrentAuthor();
  if (!author) return Response.json({ error: "Требуется авторизация." }, { status: 401 });
  let titleId: unknown;
  try { ({ titleId } = await request.json()); } catch { return Response.json({ error: "Некорректный запрос." }, { status: 400 }); }
  if (!Number.isSafeInteger(titleId) || Number(titleId) <= 0) return Response.json({ error: "Некорректная запись." }, { status: 400 });
  const result = await checkQuizGuess(Number(titleId), author.id);
  if (result.kind === "missing") return Response.json({ error: "Активная викторина не найдена." }, { status: 404 });
  if (result.kind === "not-participant") return Response.json({ error: "Сначала присоединитесь к викторине." }, { status: 403 });
  if (result.kind === "title-missing") return Response.json({ error: "Запись не найдена." }, { status: 404 });
  if (result.kind === "invalid-type") return Response.json({ error: "Этот тип записи не участвует в викторине." }, { status: 400 });
  return Response.json({ correct: result.correct });
}
