import Link from "next/link";

import { getSubmittedAuthorMediaItemsForAdmin } from "@/db/queries/media-items";
import { MEDIA_TYPE_LABELS } from "@/lib/media-types";
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
      ? "Тайтл опубликован."
      : params.rejected === "1"
        ? "Тайтл отклонен."
        : null;
  const errorMessage =
    params.error === "invalid-review" ? "Не удалось обработать заявку." : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Заявки на публикацию</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Авторские тайтлы, которые ждут проверки перед публикацией.
          </p>
        </div>
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">
          {items.length} на проверке
        </div>
      </div>

      {successMessage ? (
        <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="border border-zinc-200 p-5 text-sm text-zinc-500">
          Заявок на проверку сейчас нет.
        </div>
      ) : (
        <div className="divide-y divide-zinc-200 border border-zinc-200">
          {items.map((item) => (
            <article
              key={item.id}
              className="grid gap-4 p-4 xl:grid-cols-[120px_minmax(0,1fr)_170px]"
            >
              <div className="aspect-square bg-zinc-100">
                {item.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.coverUrl}
                    alt={`Обложка: ${item.title}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center border border-zinc-200 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                    Без обложки
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-red-700">
                  <span>{MEDIA_TYPE_LABELS[item.mediaType]}</span>
                  {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                  {item.franchiseTitle ? <span>{item.franchiseTitle}</span> : null}
                </div>
                <h3 className="mt-2 text-lg font-semibold leading-6 text-zinc-950">
                  {item.title}
                </h3>
                {item.originalTitle ? (
                  <p className="mt-1 text-sm text-zinc-500">{item.originalTitle}</p>
                ) : null}
                {item.description ? (
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-600">
                    {item.description}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                  <span>
                    Автор: {item.authorName} ({item.authorCode})
                  </span>
                  <span>Отправлено: {formatDate(item.submittedAt)}</span>
                  <span className="font-mono">{item.code}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 xl:items-stretch xl:justify-end">
                <Link
                  href={`/admin/media-review/${item.id}`}
                  className="flex h-10 w-full items-center justify-center border border-zinc-300 bg-white px-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
                >
                  Смотреть
                </Link>
                <form action={reviewAuthorMediaItemAction}>
                  <input type="hidden" name="mediaItemId" value={item.id} />
                  <input type="hidden" name="decision" value="published" />
                  <button
                    type="submit"
                    className="h-10 w-full border border-emerald-700 bg-emerald-700 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:bg-white hover:text-emerald-700"
                  >
                    Одобрить
                  </button>
                </form>
                <form action={reviewAuthorMediaItemAction}>
                  <input type="hidden" name="mediaItemId" value={item.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <button
                    type="submit"
                    className="h-10 w-full border border-red-700 bg-white px-3 text-xs font-semibold uppercase tracking-[0.16em] text-red-700 transition-colors hover:bg-red-700 hover:text-white"
                  >
                    Отклонить
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
