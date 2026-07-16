import { Check, X } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { getSubmittedFranchisesForAdmin } from "@/db/queries/franchises";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import { reviewFranchiseAction } from "./actions";

type AdminFranchiseReviewPageProps = {
  searchParams: Promise<{ approved?: string; error?: string; rejected?: string }>;
};

export default async function AdminFranchiseReviewPage({ searchParams }: AdminFranchiseReviewPageProps) {
  const [franchises, params] = await Promise.all([getSubmittedFranchisesForAdmin(), searchParams]);
  const message = params.approved === "1"
    ? "Серия опубликована."
    : params.rejected === "1"
      ? "Серия отклонена."
      : params.error === "stale-review"
        ? "Серия уже обработана или входит в заявку на тайтл."
        : params.error
          ? "Не удалось обработать серию."
          : null;
  const toasts = message ? [{ id: "review", tone: params.error ? "error" as const : "success" as const, text: message }] satisfies AdminToast[] : [];

  return (
    <div className="flex flex-col gap-5">
      <AdminToasts clearParams={["approved", "error", "rejected"]} messages={toasts} />
      <PageHeader
        title="Заявки серий"
        description="Серии, отправленные отдельно от заявки на запись."
        aside={<Badge variant="warning">{franchises.length} на проверке</Badge>}
      />
      {franchises.length === 0 ? <EmptyState>Заявок на проверку серий сейчас нет.</EmptyState> : (
        <TableWrap>
          <Table className="table-fixed">
            <THead><tr><TH>Серия</TH><TH className="w-44">Автор</TH><TH className="w-28 px-2 text-right">Действия</TH></tr></THead>
            <TBody>
              {franchises.map((franchise) => (
                <TR key={`${franchise.kind}-${franchise.id}-${franchise.kind === "link" ? franchise.franchiseId : ""}`}>
                  <TD className="min-w-0 overflow-hidden">
                    <div className="truncate font-medium text-stone-950">
                      {franchise.kind === "link" ? (
                        <>
                          <Link href={`/admin/media/${franchise.id}/edit`} className="underline decoration-stone-300 underline-offset-2 hover:decoration-stone-950">
                            {franchise.title}
                          </Link>
                          {" → "}
                          <Link href={`/admin/franchises/${franchise.franchiseId}/edit`} className="underline decoration-stone-300 underline-offset-2 hover:decoration-stone-950">
                            {franchise.franchiseTitle}
                          </Link>
                        </>
                      ) : (
                        franchise.mediaItems.length > 0 ? (
                          <>
                            {franchise.mediaItems.map((mediaItem, index) => (
                              <span key={mediaItem.id}>
                                {index > 0 ? ", " : null}
                                <Link href={`/admin/media/${mediaItem.id}/edit`} className="underline decoration-stone-300 underline-offset-2 hover:decoration-stone-950">
                                  {mediaItem.title}
                                </Link>
                              </span>
                            ))}
                            {" → "}
                            <Link href={`/admin/franchises/${franchise.id}/edit`} className="underline decoration-stone-300 underline-offset-2 hover:decoration-stone-950">
                              {franchise.title}
                            </Link>
                          </>
                        ) : (
                          <Link href={`/admin/franchises/${franchise.id}/edit`} className="underline decoration-stone-300 underline-offset-2 hover:decoration-stone-950">
                            {franchise.title}
                          </Link>
                        )
                      )}
                    </div>
                    {franchise.kind === "link" ? <div className="mt-1 text-xs text-stone-500">Привязка существующей серии</div> : franchise.mediaItems.length > 0 ? <div className="mt-1 text-xs text-stone-500">Новая серия будет добавлена к записи при одобрении</div> : null}
                    {franchise.originalTitle ? <div className="mt-1 truncate text-xs text-stone-500">{franchise.originalTitle}</div> : null}
                    {franchise.description ? <div className="mt-1 line-clamp-2 text-xs text-stone-500">{franchise.description}</div> : null}
                  </TD>
                  <TD><div className="truncate text-sm text-stone-700">{franchise.authorName}</div></TD>
                  <TD className="px-2"><div className="flex justify-end gap-1.5">
                    <form action={reviewFranchiseAction}><input type="hidden" name="franchiseId" value={franchise.kind === "link" ? franchise.franchiseId : franchise.id} />{franchise.kind === "link" ? <input type="hidden" name="mediaItemId" value={franchise.id} /> : null}<input type="hidden" name="decision" value="published" /><Button type="submit" variant="positive" size="icon" aria-label={`Одобрить заявку ${franchise.title}`}><Check /></Button></form>
                    <form action={reviewFranchiseAction}><input type="hidden" name="franchiseId" value={franchise.kind === "link" ? franchise.franchiseId : franchise.id} />{franchise.kind === "link" ? <input type="hidden" name="mediaItemId" value={franchise.id} /> : null}<input type="hidden" name="decision" value="rejected" /><Button type="submit" variant="destructive" size="icon" aria-label={`Отклонить заявку ${franchise.title}`}><X /></Button></form>
                  </div></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
