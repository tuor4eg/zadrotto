import { ArrowLeft, Check, RotateCcw, Search, Wrench, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { getBugReportActivityLogs, getBugReportById } from "@/db/queries/bug-reports";
import { canTransitionBugReportStatus, type BugReportStatus } from "@/lib/bug-reports/model";
import { AdminToasts, type AdminToast } from "../../admin-toasts";
import { transitionBugReportAction } from "../actions";

const STATUS_LABELS: Record<BugReportStatus, string> = {
  new: "Новый",
  reviewing: "На проверке",
  confirmed: "Подтверждён",
  fixed: "Исправлен",
  rejected: "Не подтверждён",
};

const TRANSITIONS: Array<{ status: BugReportStatus; label: string; icon: typeof Check; variant: "default" | "positive" | "destructive" | "outline" }> = [
  { status: "reviewing", label: "Взять на проверку", icon: Search, variant: "default" },
  { status: "confirmed", label: "Подтвердить", icon: Check, variant: "positive" },
  { status: "fixed", label: "Закрыть как исправленный", icon: Wrench, variant: "positive" },
  { status: "rejected", label: "Не подтвердилось", icon: X, variant: "destructive" },
];

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" }).format(value);
}

function getEntityHref(entityType: string | null, entityId: string | null) {
  if (!entityId || !/^\d+$/.test(entityId)) return null;
  if (entityType === "media-item") return `/admin/media/${entityId}/edit`;
  if (entityType === "franchise") return `/admin/series/${entityId}/edit`;
  if (entityType === "quiz") return `/admin/quizzes/${entityId}/edit`;
  return null;
}

export default async function AdminBugReportPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; error?: string; updated?: string }>;
}) {
  const [{ id: idValue }, query] = await Promise.all([params, searchParams]);
  const id = Number(idValue);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [report, activityLogs] = await Promise.all([
    getBugReportById(id),
    getBugReportActivityLogs(id),
  ]);
  if (!report) notFound();

  const status = report.status as BugReportStatus;
  const entityHref = getEntityHref(report.entityType, report.entityId);
  const wasCreatedByAdmin = activityLogs.some((entry) => entry.action === "bug-report.created");
  const toastMessages = [
    ...(query.created === "1" ? [{ id: "created", tone: "success" as const, text: "Багрепорт создан." }] : []),
    ...(query.updated === "1" ? [{ id: "updated", tone: "success" as const, text: "Статус багрепорта изменён." }] : []),
    ...(query.error ? [{ id: "error", tone: "error" as const, text: query.error === "stale-status" ? "Статус уже изменился. Обнови страницу." : "Не удалось изменить статус." }] : []),
  ] satisfies AdminToast[];

  return (
    <div className="flex flex-col gap-5">
      <AdminToasts clearParams={["created", "error", "updated"]} messages={toastMessages} />
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/bug-reports" className={buttonVariants({ size: "sm", variant: "outline" })}><ArrowLeft />К списку</Link>
        {TRANSITIONS.filter((transition) => canTransitionBugReportStatus(status, transition.status)).map((transition) => {
          const Icon = transition.icon;
          return (
            <form key={transition.status} action={transitionBugReportAction}>
              <input type="hidden" name="id" value={report.id} />
              <input type="hidden" name="expectedStatus" value={status} />
              <Button type="submit" name="status" value={transition.status} variant={transition.variant} size="sm">
                {status === "fixed" || status === "rejected" ? <RotateCcw /> : <Icon />}{transition.label}
              </Button>
            </form>
          );
        })}
      </div>

      <article className="rounded-lg border border-stone-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs uppercase tracking-[0.14em] text-stone-500">Багрепорт #{report.id}</p><h2 className="mt-1 text-2xl font-semibold">{STATUS_LABELS[status]}</h2></div>
          <Badge>{STATUS_LABELS[status]}</Badge>
        </div>
        <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-stone-800">{report.description}</p>

        <dl className="mt-6 grid gap-4 border-t border-stone-100 pt-5 text-sm sm:grid-cols-2">
          <div><dt className="text-stone-500">Автор</dt><dd className="mt-1"><Link className="font-medium underline underline-offset-2" href={`/admin/authors/${report.authorId}`}>{report.authorName}</Link></dd></div>
          <div><dt className="text-stone-500">Страница</dt><dd className="mt-1 break-all"><Link className="underline underline-offset-2" href={report.url}>{report.url}</Link></dd></div>
          <div><dt className="text-stone-500">Сущность</dt><dd className="mt-1">{report.entityType && report.entityId ? entityHref ? <Link className="underline underline-offset-2" href={entityHref}>{report.entityType} #{report.entityId}</Link> : `${report.entityType} #${report.entityId}` : "—"}</dd></div>
          <div><dt className="text-stone-500">Создан</dt><dd className="mt-1">{formatDate(report.createdAt)}</dd></div>
          <div><dt className="text-stone-500">Подтверждён</dt><dd className="mt-1">{formatDate(report.confirmedAt)}</dd></div>
          <div><dt className="text-stone-500">Закрыт</dt><dd className="mt-1">{formatDate(report.resolvedAt)}{report.resolvedByAdminLogin ? ` · ${report.resolvedByAdminLogin}` : ""}</dd></div>
        </dl>

        {report.clientContext ? (
          <div className="mt-6 border-t border-stone-100 pt-5">
            <h3 className="text-sm font-semibold">Технический контекст</h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-stone-500">Браузер</dt><dd className="mt-1 break-words">{report.clientContext.userAgent ?? "—"}</dd></div>
              <div><dt className="text-stone-500">Часовой пояс</dt><dd className="mt-1">{report.clientContext.timezone ?? "—"}</dd></div>
              <div><dt className="text-stone-500">Экран</dt><dd className="mt-1">{report.clientContext.viewportWidth && report.clientContext.viewportHeight ? `${report.clientContext.viewportWidth} × ${report.clientContext.viewportHeight}` : "—"}</dd></div>
              <div><dt className="text-stone-500">Обновлён</dt><dd className="mt-1">{formatDate(report.updatedAt)}</dd></div>
            </dl>
          </div>
        ) : null}
      </article>

      <section className="rounded-lg border border-stone-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">История обработки</h2>
        {activityLogs.length > 0 ? (
          <ol className="mt-4 grid gap-4 border-l border-stone-200 pl-5">
            {activityLogs.map((entry, index) => (
              <li key={`${entry.createdAt.toISOString()}-${index}`} className="relative">
                <span className="absolute -left-[1.56rem] top-1 size-2 rounded-full bg-stone-500" aria-hidden="true" />
                <p className="text-sm font-medium">{entry.message}</p>
                <p className="mt-1 text-xs text-stone-500">{formatDate(entry.createdAt)} · {entry.adminLogin ?? "Удалённый админ"}</p>
              </li>
            ))}
            {!wasCreatedByAdmin ? (
              <li className="relative">
                <span className="absolute -left-[1.56rem] top-1 size-2 rounded-full bg-stone-300" aria-hidden="true" />
                <p className="text-sm font-medium">Багрепорт создан.</p>
                <p className="mt-1 text-xs text-stone-500">{formatDate(report.createdAt)} · {report.authorName}</p>
              </li>
            ) : null}
          </ol>
        ) : (
          <ol className="mt-4 border-l border-stone-200 pl-5">
            <li className="relative">
              <span className="absolute -left-[1.56rem] top-1 size-2 rounded-full bg-stone-300" aria-hidden="true" />
              <p className="text-sm font-medium">Багрепорт создан.</p>
              <p className="mt-1 text-xs text-stone-500">{formatDate(report.createdAt)} · {report.authorName}</p>
            </li>
          </ol>
        )}
      </section>
    </div>
  );
}
