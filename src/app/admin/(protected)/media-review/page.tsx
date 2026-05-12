import Link from "next/link";
import { Check, Eye, X } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { getSubmittedAuthorMediaItemsForAdmin } from "@/db/queries/media-items";
import { getAdminFormErrorMessage } from "@/lib/app-error-messages";
import { MEDIA_TYPE_LABELS } from "@/lib/media-types";
import { EmptyState, PageHeader } from "../admin-ui";
import { reviewAuthorMediaItemAction } from "./actions";

type AdminMediaReviewPageProps = {
  searchParams: Promise<{
    approved?: string;
    rejected?: string;
    error?: string;
  }>;
};

function formatDate(value: Date | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(value);
}

export default async function AdminMediaReviewPage({
  searchParams,
}: AdminMediaReviewPageProps) {
  const [items, params] = await Promise.all([
    getSubmittedAuthorMediaItemsForAdmin(),
    searchParams,
  ]);
  const successMessage =
    params.approved === "1"
      ? "Запись опубликована."
      : params.rejected === "1"
        ? "Запись отклонена."
        : null;
  const errorMessage =
    getAdminFormErrorMessage(params.error) ??
    (params.error === "invalid-review" ? "Не удалось обработать заявку." : null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Заявки на публикацию"
        description="Авторские записи, которые ждут проверки перед публикацией."
        aside={<Badge variant="warning">{items.length} на проверке</Badge>}
      />

      {successMessage ? (
        <Alert variant="success">{successMessage}</Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">{errorMessage}</Alert>
      ) : null}

      {items.length === 0 ? (
        <EmptyState>Заявок на проверку сейчас нет.</EmptyState>
      ) : (
        <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
          {items.map((item) => (
            <article
              key={item.id}
              className="grid gap-4 p-4 xl:grid-cols-[120px_minmax(0,1fr)_170px]"
            >
              <div className="aspect-square overflow-hidden rounded-md bg-stone-100">
                {item.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.coverUrl}
                    alt={`Обложка: ${item.title}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center border border-stone-200 text-xs font-medium text-stone-400">
                    Без обложки
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default">{MEDIA_TYPE_LABELS[item.mediaType]}</Badge>
                  {item.releaseYear ? <Badge variant="outline">{item.releaseYear}</Badge> : null}
                  {item.franchiseTitle ? <Badge variant="outline">{item.franchiseTitle}</Badge> : null}
                </div>
                <h3 className="mt-2 text-lg font-semibold leading-6 text-stone-950">
                  {item.title}
                </h3>
                {item.originalTitle ? (
                  <p className="mt-1 text-sm text-stone-500">{item.originalTitle}</p>
                ) : null}
                {item.description ? (
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-600">
                    {item.description}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                  <span>Автор: {item.authorName}</span>
                  <span>Отправлено: {formatDate(item.submittedAt)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 xl:items-stretch xl:justify-end">
                <Link
                  href={`/admin/media-review/${item.id}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <Eye />
                  Смотреть
                </Link>
                <form action={reviewAuthorMediaItemAction}>
                  <input type="hidden" name="mediaItemId" value={item.id} />
                  <input type="hidden" name="decision" value="published" />
                  <Button
                    type="submit"
                    variant="positive"
                    className="w-full"
                  >
                    <Check />
                    Одобрить
                  </Button>
                </form>
                <form action={reviewAuthorMediaItemAction}>
                  <input type="hidden" name="mediaItemId" value={item.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <Button
                    type="submit"
                    variant="destructive"
                    className="w-full"
                  >
                    <X />
                    Отклонить
                  </Button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
