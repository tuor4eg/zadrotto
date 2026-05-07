import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";

import { MediaItemDetails } from "@/app/media-item-details";
import { Button } from "@/components/ui/button";
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
}: {
  mediaItemId: number;
  decision: "published" | "rejected";
  children: React.ReactNode;
}) {
  return (
    <form action={reviewAuthorMediaItemAction}>
      <input type="hidden" name="mediaItemId" value={mediaItemId} />
      <input type="hidden" name="decision" value={decision} />
      <Button type="submit" variant={decision === "published" ? "positive" : "destructive"}>
        {children}
      </Button>
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
          >
            <Check />
            Одобрить
          </ReviewButton>
          <ReviewButton
            mediaItemId={item.id}
            decision="rejected"
          >
            <X />
            Отклонить
          </ReviewButton>
        </>
      }
      noteSlot={
        <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm leading-6 text-stone-600">
          Автор: {item.authorName} ({item.authorCode}). Отправлено: {formatDate(item.submittedAt)}.
        </div>
      }
    />
  );
}
