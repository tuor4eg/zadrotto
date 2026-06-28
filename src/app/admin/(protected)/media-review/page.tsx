import Link from "next/link";
import { Check, Eye, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getSubmittedAuthorMediaItemsForAdmin } from "@/db/queries/media-items";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { getAdminFormErrorMessage } from "@/lib/common/app-error-messages";
import { getMediaTypeLabel } from "@/lib/media/types";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import { reviewAuthorMediaItemAction } from "./actions";

type AdminMediaReviewPageProps = {
  searchParams: Promise<{
    approved?: string;
    rejected?: string;
    error?: string;
  }>;
};
type SubmittedMediaItem = Awaited<ReturnType<typeof getSubmittedAuthorMediaItemsForAdmin>>[number];

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

function ReviewMediaCover({
  coverUrl,
  size = "sm",
  title,
}: {
  coverUrl: string | null;
  size?: "md" | "sm";
  title: string;
}) {
  const className = size === "md" ? "h-20 w-14" : "size-14";

  return (
    <div className={`${className} overflow-hidden rounded-md bg-stone-100`}>
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt={`Обложка: ${title}`}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center border border-stone-200 text-[10px] font-medium text-stone-400">
          Нет
        </div>
      )}
    </div>
  );
}

function ReviewMediaActions({ item }: { item: SubmittedMediaItem }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Tooltip label="Смотреть">
        <Link
          href={`/admin/media-review/${item.id}`}
          aria-label={`Смотреть заявку ${item.title}`}
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <Eye />
        </Link>
      </Tooltip>
      <Tooltip label="Одобрить">
        <form action={reviewAuthorMediaItemAction}>
          <input type="hidden" name="mediaItemId" value={item.id} />
          <input type="hidden" name="decision" value="published" />
          <Button
            type="submit"
            variant="positive"
            size="icon"
            aria-label={`Одобрить заявку ${item.title}`}
          >
            <Check />
          </Button>
        </form>
      </Tooltip>
      <Tooltip label="Отклонить">
        <form action={reviewAuthorMediaItemAction}>
          <input type="hidden" name="mediaItemId" value={item.id} />
          <input type="hidden" name="decision" value="rejected" />
          <Button
            type="submit"
            variant="destructive"
            size="icon"
            aria-label={`Отклонить заявку ${item.title}`}
          >
            <X />
          </Button>
        </form>
      </Tooltip>
    </div>
  );
}

export default async function AdminMediaReviewPage({
  searchParams,
}: AdminMediaReviewPageProps) {
  const [items, params, mediaTypes] = await Promise.all([
    getSubmittedAuthorMediaItemsForAdmin(),
    searchParams,
    getMediaTypeOptions(),
  ]);
  const successMessage =
    params.approved === "1"
      ? "Запись опубликована."
      : params.rejected === "1"
        ? "Запись отклонена."
        : null;
  const errorMessage =
    getAdminFormErrorMessage(params.error) ??
    (params.error === "stale-review"
      ? "Заявка уже не на проверке. Автор мог отозвать ее или запись уже обработали."
      : null) ??
    (params.error === "invalid-review" ? "Не удалось обработать заявку." : null);
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];

  return (
    <div className="flex flex-col gap-5">
      <AdminToasts clearParams={["approved", "error", "rejected"]} messages={toastMessages} />

      <PageHeader
        title="Заявки на публикацию"
        description="Авторские записи, которые ждут проверки перед публикацией."
        aside={<Badge variant="warning">{items.length} на проверке</Badge>}
      />

      {items.length === 0 ? (
        <EmptyState>Заявок на проверку сейчас нет.</EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:hidden">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
              >
                <div className="flex gap-3">
                  <div className="shrink-0">
                    <ReviewMediaCover coverUrl={item.coverUrl} size="md" title={item.title} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="default">{getMediaTypeLabel(item.mediaType, mediaTypes)}</Badge>
                      {item.releaseYear ? <Badge variant="outline">{item.releaseYear}</Badge> : null}
                      {item.franchises.map((franchise) => (
                        <Badge key={franchise.id} variant="outline">{franchise.title}</Badge>
                      ))}
                    </div>
                    <h3 className="mt-2 break-words font-semibold leading-5 text-stone-950">
                      {item.title}
                    </h3>
                    {item.originalTitle ? (
                      <p className="mt-1 break-words text-xs leading-5 text-stone-500">
                        {item.originalTitle}
                      </p>
                    ) : null}
                  </div>
                </div>

                {item.description ? (
                  <p className="mt-3 border-t border-stone-100 pt-3 text-xs leading-5 text-stone-600">
                    {item.description}
                  </p>
                ) : null}

                <div className="mt-3 grid gap-3 border-t border-stone-100 pt-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
                        Автор
                      </div>
                      <Link
                        href={`/admin/authors/${item.authorId}`}
                        className="font-medium text-stone-700 underline underline-offset-2 transition-colors hover:text-stone-950"
                      >
                        {item.authorName}
                      </Link>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
                        Отправлено
                      </div>
                      <div className="text-xs tabular-nums text-stone-500">
                        {formatDate(item.submittedAt)}
                      </div>
                    </div>
                  </div>

                  <ReviewMediaActions item={item} />
                </div>
              </div>
            ))}
          </div>

          <TableWrap className="hidden sm:block">
            <Table className="table-fixed">
              <THead>
                <tr>
                  <TH className="w-20">Обложка</TH>
                  <TH>Запись</TH>
                  <TH className="w-40">Автор</TH>
                  <TH className="w-44">Отправлено</TH>
                  <TH className="w-36 px-2 text-right">Действия</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((item) => (
                  <TR key={item.id}>
                    <TD>
                      <ReviewMediaCover coverUrl={item.coverUrl} title={item.title} />
                    </TD>
                    <TD className="min-w-0 overflow-hidden">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="default">{getMediaTypeLabel(item.mediaType, mediaTypes)}</Badge>
                        {item.releaseYear ? <Badge variant="outline">{item.releaseYear}</Badge> : null}
                        {item.franchises.map((franchise) => (
                          <Badge key={franchise.id} variant="outline">{franchise.title}</Badge>
                        ))}
                      </div>
                      <h3 className="mt-1 truncate font-semibold leading-5 text-stone-950">
                        {item.title}
                      </h3>
                      {item.originalTitle ? (
                        <p className="truncate text-xs text-stone-500">{item.originalTitle}</p>
                      ) : null}
                      {item.description ? (
                        <p className="mt-1 line-clamp-1 text-xs leading-5 text-stone-600">
                          {item.description}
                        </p>
                      ) : null}
                    </TD>
                    <TD className="min-w-0 overflow-hidden">
                      <Link
                        href={`/admin/authors/${item.authorId}`}
                        className="block truncate font-medium text-stone-700 underline underline-offset-2 transition-colors hover:text-stone-950"
                      >
                        {item.authorName}
                      </Link>
                    </TD>
                    <TD className="text-xs tabular-nums text-stone-500">
                      {formatDate(item.submittedAt)}
                    </TD>
                    <TD className="px-2">
                      <ReviewMediaActions item={item} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </>
      )}
    </div>
  );
}
