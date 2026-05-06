import { notFound } from "next/navigation";

import { MediaItemDetails } from "@/app/media-item-details";
import { getSubmittedAuthorMediaItemForAdminView } from "@/db/queries/media-items";
import { reviewAuthorMediaItemAction } from "../actions";

type AdminMediaReviewItemPageProps = {
  params: Promise<{
    id: string;
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

function ReviewButton({
  mediaItemId,
  decision,
  children,
  className,
}: {
  mediaItemId: number;
  decision: "published" | "rejected";
  children: React.ReactNode;
  className: string;
}) {
  return (
    <form action={reviewAuthorMediaItemAction}>
      <input type="hidden" name="mediaItemId" value={mediaItemId} />
      <input type="hidden" name="decision" value={decision} />
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}

export default async function AdminMediaReviewItemPage({
  params,
}: AdminMediaReviewItemPageProps) {
  const { id } = await params;
  const mediaItemId = Number(id);

  if (!Number.isInteger(mediaItemId) || mediaItemId <= 0) {
    notFound();
  }

  const item = await getSubmittedAuthorMediaItemForAdminView(mediaItemId);

  if (!item) {
    notFound();
  }

  return (
    <MediaItemDetails
      item={item}
      backLink={{ href: "/admin/media-review", label: "Назад к заявкам" }}
      meta={<span>На проверке</span>}
      actions={
        <>
          <ReviewButton
            mediaItemId={item.id}
            decision="published"
            className="w-fit border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:bg-white hover:text-emerald-700"
          >
            Одобрить
          </ReviewButton>
          <ReviewButton
            mediaItemId={item.id}
            decision="rejected"
            className="w-fit border border-red-700 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-700 transition-colors hover:bg-red-700 hover:text-white"
          >
            Отклонить
          </ReviewButton>
        </>
      }
      noteSlot={
        <div className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-600">
          Автор: {item.authorName} ({item.authorCode}). Отправлено: {formatDate(item.submittedAt)}.
        </div>
      }
    />
  );
}
