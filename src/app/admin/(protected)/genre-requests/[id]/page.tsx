import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { getGenreRequestDetail } from "@/db/queries/genre-requests";
import { getAdminGenres } from "@/db/queries/genres";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { parseGenreId } from "@/lib/media/admin-genres";
import { AdminToasts, type AdminToast } from "../../admin-toasts";
import { EmptyState, PageHeader } from "../../admin-ui";
import { resolveGenreRequestAction, retryGenreRequestAction } from "../actions";
import { GenreRequestAutoRefresh } from "../auto-refresh";
import { GenreRequestDecisionForm } from "../decision-form";
import { genreProviderLabel, genreRequestDate, genreRequestError, GenreRequestStatus } from "../presentation";

export default async function GenreRequestPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; error?: string; saved?: string; retried?: string }>;
}) {
  await requireAdminUser();
  const [{ id: idValue }, query] = await Promise.all([params, searchParams]);
  const id = parseGenreId(idValue);
  if (!id) notFound();
  const page = parseGenreId(query.page) ?? 1;
  const detail = await getGenreRequestDetail(id, { page });
  if (!detail) notFound();
  const { request, variants, items, genres } = detail;
  const choices = request.status === "pending" ? (await getAdminGenres()).filter((genre) => genre.isActive && genre.slug.startsWith("game-") === (request.mediaType === "game")) : [];
  const error = genreRequestError(query.error);
  const messages = [
    ...(query.saved === "1" ? [{ id: "saved", tone: "success" as const, text: "Решение сохранено. Обновление записей поставлено в очередь." }] : []),
    ...(query.retried === "1" ? [{ id: "retried", tone: "success" as const, text: "Повторное применение поставлено в очередь." }] : []),
    ...(error ? [{ id: "error", tone: "error" as const, text: error }] : []),
  ] satisfies AdminToast[];
  return <div className="grid gap-6">
    <PageHeader title={request.externalGenreName} description={`${genreProviderLabel(request.provider)} · ${request.mediaTypeName}`}
      aside={<Link href="/admin/genre-requests" className={buttonVariants({ variant: "outline", size: "sm" })}>К заявкам</Link>} />
    <AdminToasts clearParams={["error", "saved", "retried"]} messages={messages} />
    <GenreRequestAutoRefresh enabled={request.status === "applying"} />
    <div className="flex flex-wrap items-center gap-3"><GenreRequestStatus status={request.status} />
      <span className="text-sm text-stone-500">Обнаружен: {genreRequestDate(request.firstSeenAt)}</span>
    </div>
    <section className="grid gap-3"><h3 className="font-semibold">Исходные варианты</h3>
      {variants.length ? <ul className="grid gap-2 text-sm">{variants.map((variant) => <li key={JSON.stringify([variant.name, variant.externalId])} className="break-words">
        {variant.name}{variant.externalId ? <span className="ml-2 break-all text-xs text-stone-500">ID: {variant.externalId}</span> : null}
        <span className="ml-2 text-xs text-stone-500">Записей: {variant.count}</span>
      </li>)}</ul> : <p className="break-words text-sm text-stone-500">{request.externalGenreName} · Нет текущих связанных записей.</p>}
    </section>
    <section className="grid gap-3 border-t border-stone-200 pt-5"><h3 className="font-semibold">Решение</h3>
      {request.status === "pending" ? <GenreRequestDecisionForm requestId={id} genres={choices} action={resolveGenreRequestAction} /> : <>
        <p className="text-sm">{request.decision === "exclude" ? "Не считать жанром" : request.decision === "create" ? "Создан наш жанр" : "Связано с существующими жанрами"}</p>
        {genres.length ? <p className="text-sm font-medium">{genres.map((genre) => genre.name).join(", ")}</p> : null}
        <p className="text-xs text-stone-500">Принято: {genreRequestDate(request.resolvedAt)} · Администратор #{request.resolvedByAdminId}</p>
        {request.status === "applying" ? <p role="status" className="text-sm text-stone-500">Обновляем жанры существующих записей. Статус обновляется автоматически.</p> : null}
        {request.status === "failed" ? <div className="grid gap-3">
          <p className="break-words text-sm text-red-700">{request.jobError || "Не удалось завершить применение решения."}</p>
          <form action={retryGenreRequestAction}><input type="hidden" name="requestId" value={id} /><Button type="submit">Повторить применение</Button></form>
        </div> : null}
      </>}
    </section>
    <section className="grid gap-3 border-t border-stone-200 pt-5"><h3 className="font-semibold">Связанные записи ({request.occurrenceCount})</h3>
      {items.length ? <ul className="grid gap-2">{items.map((item) => <li key={item.id} className="min-w-0">
        <Link href={`/admin/media/${item.id}/edit`} className="break-words text-sm underline underline-offset-4">{item.title}</Link>
      </li>)}</ul> : <EmptyState>Нет текущих связанных записей.</EmptyState>}
      {detail.totalPages > 1 ? <nav aria-label="Страницы связанных записей" className="flex flex-wrap items-center gap-3">
        {detail.page > 1 ? <Link href={`/admin/genre-requests/${id}?page=${detail.page - 1}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Назад</Link> : null}
        <span className="text-sm text-stone-500">{detail.page} / {detail.totalPages}</span>
        {detail.page < detail.totalPages ? <Link href={`/admin/genre-requests/${id}?page=${detail.page + 1}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Далее</Link> : null}
      </nav> : null}
    </section>
  </div>;
}
