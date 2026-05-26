import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Layers3,
  Star,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getAdminDashboardStats } from "@/db/queries/admin-dashboard";
import { PUBLICATION_STATUS_LABELS } from "@/lib/publication-status";
import { PageHeader } from "./admin-ui";

function formatCount(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default async function AdminPage() {
  const stats = await getAdminDashboardStats();
  const overview = [
    {
      icon: FileText,
      label: "Записей",
      value: stats.mediaItems.totalCount,
      detail: `${formatCount(stats.mediaItems.publishedCount)} опубликовано`,
      href: "/admin/media",
    },
    {
      icon: Clock3,
      label: "Заявок",
      value: stats.mediaItems.submittedCount,
      detail: "ждут модерации",
      href: "/admin/media-review",
    },
    {
      icon: UserRound,
      label: "Авторов",
      value: stats.authors.totalCount,
      detail:
        stats.authors.blockedCount > 0
          ? `${formatCount(stats.authors.blockedCount)} заблокировано`
          : "все активны",
      href: "/admin/authors",
    },
    {
      icon: Star,
      label: "Оценок",
      value: stats.ratings.totalCount,
      detail: "в архиве",
      href: "/admin/media?sort=ratings_count",
    },
    {
      icon: Layers3,
      label: "Серий",
      value: stats.franchises.totalCount,
      detail: "связи записей",
      href: "/admin/franchises",
    },
    {
      icon: CheckCircle2,
      label: "Опубликовано",
      value: stats.mediaItems.publishedCount,
      detail: "видно в публичном архиве",
      href: "/admin/media",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Главная"
        description="Короткая сводка по текущему состоянию архива."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {overview.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={item.href}
              className="rounded-lg border border-stone-200 bg-stone-50/70 p-4 transition-colors hover:border-stone-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-stone-500">{item.label}</div>
                  <div className="mt-2 text-3xl font-semibold tabular-nums text-stone-950">
                    {formatCount(item.value)}
                  </div>
                </div>
                <div className="flex size-9 items-center justify-center rounded-md bg-white text-stone-500 shadow-sm ring-1 ring-stone-200">
                  <Icon className="size-4" />
                </div>
              </div>
              <div className="mt-3 text-sm text-stone-500">{item.detail}</div>
            </Link>
          );
        })}
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="mb-3 text-sm font-medium text-stone-950">Статусы записей</div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {PUBLICATION_STATUS_LABELS.private}: {formatCount(stats.mediaItems.privateCount)}
          </Badge>
          <Badge variant="warning">
            {PUBLICATION_STATUS_LABELS.submitted}: {formatCount(stats.mediaItems.submittedCount)}
          </Badge>
          <Badge variant="positive">
            {PUBLICATION_STATUS_LABELS.published}: {formatCount(stats.mediaItems.publishedCount)}
          </Badge>
          <Badge variant="destructive">
            {PUBLICATION_STATUS_LABELS.rejected}: {formatCount(stats.mediaItems.rejectedCount)}
          </Badge>
        </div>
      </div>
    </div>
  );
}
