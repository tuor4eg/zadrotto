import { getCurrentAuthor, getPersonalDataConsentDenial } from "@/lib/auth/author-auth";
import { getQuizActionHandler } from "@/lib/quizzes/action-handlers";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) {
  const denial = await getPersonalDataConsentDenial();
  if (denial) return denial;
  const author = await getCurrentAuthor();
  if (!author) return Response.json({ error: "Требуется авторизация." }, { status: 401 });
  const id = Number((await params).id);
  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ error: "Некорректный запрос." }, { status: 400 }); }
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647 || !input || typeof input !== "object") return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  const value = input as Record<string, unknown>;
  const handler = getQuizActionHandler(value.mechanic);
  if (!handler) return Response.json({ error: "Неизвестная механика." }, { status: 400 });
  const result = await handler.execute(id, author.id, value);
  if (result.kind === "invalid-action") return Response.json({ error: "Некорректное действие." }, { status: 400 });
  if (result.kind === "result") return Response.json(result);
  if (result.kind === "conflict" || result.kind === "completed") return Response.json({ error: "Состояние квиза изменилось.", ...result }, { status: 409 });
  const status = result.kind === "not-participant" ? 403 : result.kind === "invalid-type" ? 400 : 404;
  return Response.json({ error: "Действие недоступно.", kind: result.kind }, { status });
}
