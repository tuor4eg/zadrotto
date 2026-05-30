import Link from "next/link";
import { Check, Eye, X } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
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
    (params.error === "stale-review"
      ? "Заявка уже не на проверке. Автор мог отозвать ее или запись уже обработали."
      : null) ??
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
        <TableWrap>
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
                    <div className="size-14 overflow-hidden rounded-md bg-stone-100">
                      {item.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.coverUrl}
                          alt={`Обложка: ${item.title}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center border border-stone-200 text-[10px] font-medium text-stone-400">
                          Нет
                        </div>
                      )}
                    </div>
                  </TD>
                  <TD className="min-w-0 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="default">{MEDIA_TYPE_LABELS[item.mediaType]}</Badge>
                      {item.releaseYear ? <Badge variant="outline">{item.releaseYear}</Badge> : null}
                      {item.franchiseTitle ? <Badge variant="outline">{item.franchiseTitle}</Badge> : null}
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
                    <div className="flex items-center justify-end gap-2">
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
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
