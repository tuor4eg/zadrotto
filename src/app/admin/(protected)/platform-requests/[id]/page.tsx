import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { getPlatformRequestDetail } from "@/db/queries/platform-requests";
import { getAdminPlatforms } from "@/db/queries/platforms";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { parsePlatformId } from "@/lib/media/admin-platforms";
import { AdminToasts, type AdminToast } from "../../admin-toasts";
import { EmptyState, PageHeader } from "../../admin-ui";
import { resolvePlatformRequestAction, retryPlatformRequestAction } from "../actions";
import { PlatformRequestAutoRefresh } from "../auto-refresh";
import { PlatformRequestDecisionForm } from "../decision-form";
import { platformProviderLabel, platformProviderName, platformRequestDate, platformRequestError, PlatformRequestStatus } from "../presentation";

export default async function PlatformRequestPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; error?: string; saved?: string; retried?: string; reopened?: string }>;
}) {
  await requireAdminUser();
  const [{ id: idValue }, query] = await Promise.all([params, searchParams]);
  const id = parsePlatformId(idValue);
  if (!id) notFound();
  const page = parsePlatformId(query.page) ?? 1;
  const detail = await getPlatformRequestDetail(id, { page });
  if (!detail) notFound();
  const { request, variants, items, platforms } = detail;
  const platformChoices = request.status === "pending" ? await getAdminPlatforms() : [];
  const choices = platformChoices.filter((platform) => platform.isActive);
  const error = platformRequestError(query.error);
  const messages = [
    ...(query.reopened === "1" ? [{ id: "reopened", tone: "success" as const, text: "Вариант возвращён в заявки. Пересчёт платформ записей поставлен в очередь." }] : []),
    ...(query.saved === "1" ? [{ id: "saved", tone: "success" as const, text: "Решение сохранено. Обновление записей поставлено в очередь." }] : []),
    ...(query.retried === "1" ? [{ id: "retried", tone: "success" as const, text: "Повторное применение поставлено в очередь." }] : []),
    ...(error ? [{ id: "error", tone: "error" as const, text: error }] : []),
  ] satisfies AdminToast[];
  return <div className="grid gap-6">
    <PageHeader title={platformProviderName(request.provider, request.externalPlatformName)} description={`${platformProviderLabel(request.provider)} · ${request.mediaTypeName}`}
      aside={<Link href="/admin/platform-requests" className={buttonVariants({ variant: "outline", size: "sm" })}>К заявкам</Link>} />
    <AdminToasts clearParams={["error", "saved", "retried", "reopened"]} messages={messages} />
    <PlatformRequestAutoRefresh enabled={request.status === "applying"} />
    <div className="flex flex-wrap items-center gap-3"><PlatformRequestStatus status={request.status} />
      <span className="text-sm text-stone-500">Обнаружена: {platformRequestDate(request.firstSeenAt)}</span>
    </div>
    <section className="grid gap-3"><h3 className="font-semibold">Исходные варианты</h3>
      {variants.length ? <ul className="grid gap-2 text-sm">{variants.map((variant) => <li key={variant.name} className="break-words">
        {platformProviderName(request.provider, variant.name)}
        <span className="ml-2 text-xs text-stone-500">Записей: {variant.count}</span>
      </li>)}</ul> : <p className="break-words text-sm text-stone-500">{platformProviderName(request.provider, request.externalPlatformName)} · Нет текущих связанных записей.</p>}
    </section>
    <section className="grid gap-3 border-t border-stone-200 pt-5"><h3 className="font-semibold">Решение</h3>
      {request.status === "pending" ? <PlatformRequestDecisionForm requestId={id} platforms={choices} action={resolvePlatformRequestAction} /> : <>
        {request.decision === null ? <p className="text-sm">Снимаем прежние соответствия. Выбор платформ станет доступен после пересчёта записей.</p> : <>
        <p className="text-sm">{request.decision === "exclude" ? "Не считать платформой" : request.decision === "create" ? "Создана наша платформа" : "Связано с существующими платформами"}</p>
        {platforms.length ? <p className="text-sm font-medium">{platforms.map((platform) => platform.name).join(", ")}</p> : null}
        <p className="text-xs text-stone-500">Принято: {platformRequestDate(request.resolvedAt)} · Администратор #{request.resolvedByAdminId}</p>
        </>}
        {request.status === "applying" ? <p role="status" className="text-sm text-stone-500">Обновляем платформы существующих записей. Статус обновляется автоматически.</p> : null}
        {request.status === "failed" ? <div className="grid gap-3">
          <p className="break-words text-sm text-red-700">{request.jobError || "Не удалось завершить применение решения."}</p>
          <form action={retryPlatformRequestAction}><input type="hidden" name="requestId" value={id} /><Button type="submit">{request.decision === null ? "Повторить пересчёт" : "Повторить применение"}</Button></form>
        </div> : null}
      </>}
    </section>
    <section className="grid gap-3 border-t border-stone-200 pt-5"><h3 className="font-semibold">Связанные записи ({request.occurrenceCount})</h3>
      {items.length ? <ul className="grid gap-2">{items.map((item) => <li key={item.id} className="min-w-0">
        <Link href={`/admin/media/${item.id}/edit`} className="break-words text-sm underline underline-offset-4">{item.title}</Link>
      </li>)}</ul> : <EmptyState>Нет текущих связанных записей.</EmptyState>}
      {detail.totalPages > 1 ? <nav aria-label="Страницы связанных записей" className="flex flex-wrap items-center gap-3">
        {detail.page > 1 ? <Link href={`/admin/platform-requests/${id}?page=${detail.page - 1}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Назад</Link> : null}
        <span className="text-sm text-stone-500">{detail.page} / {detail.totalPages}</span>
        {detail.page < detail.totalPages ? <Link href={`/admin/platform-requests/${id}?page=${detail.page + 1}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Далее</Link> : null}
      </nav> : null}
    </section>
  </div>;
}
