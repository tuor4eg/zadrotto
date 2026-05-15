import Link from "next/link";

import type { getFranchiseOptions } from "@/db/queries/franchises";
import { MEDIA_TYPE_LABELS, MEDIA_TYPES, type MediaType } from "@/lib/media-types";
import { resolveCoverUrl } from "@/lib/storage";
import { CoverFileInput } from "./cover-file-input";

type MediaItemFormValues = {
  id?: number;
  title?: string;
  originalTitle?: string | null;
  description?: string | null;
  mediaType?: MediaType;
  franchiseId?: number | null;
  releaseYear?: number | null;
  coverUrl?: string | null;
};

type MediaItemFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  franchises: Awaited<ReturnType<typeof getFranchiseOptions>>;
  values?: MediaItemFormValues;
  error?: string;
};

function getErrorMessage(error?: string) {
  if (error === "required") {
    return "Заполни название и тип медиа.";
  }

  if (error === "invalid-year") {
    return "Год должен быть числом от 0 до 9999.";
  }

  if (error === "invalid-franchise") {
    return "Выбранная серия не найдена.";
  }

  if (error === "cover-type") {
    return "Обложка должна быть JPG, PNG или WebP.";
  }

  if (error === "cover-too-large") {
    return "Обложка должна быть не больше 5 МБ.";
  }

  if (error === "cover-upload") {
    return "Не удалось загрузить обложку. Проверь S3-настройки.";
  }

  if (error === "cover-delete") {
    return "Не удалось удалить обложку из хранилища. Проверь S3-настройки.";
  }

  return null;
}

export function MediaItemForm({
  action,
  submitLabel,
  franchises,
  values,
  error,
}: MediaItemFormProps) {
  const errorMessage = getErrorMessage(error);

  return (
    <form action={action} className="grid gap-5" noValidate>
      {values?.id ? <input type="hidden" name="mediaItemId" value={values.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <label
            htmlFor="author-media-title"
            className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
          >
            Название
          </label>
          <input
            id="author-media-title"
            name="title"
            type="text"
            required
            defaultValue={values?.title ?? ""}
            className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
          />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <label
            htmlFor="author-media-original-title"
            className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
          >
            Оригинальное название
          </label>
          <input
            id="author-media-original-title"
            name="originalTitle"
            type="text"
            defaultValue={values?.originalTitle ?? ""}
            className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="author-media-type"
            className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
          >
            Тип медиа
          </label>
          <select
            id="author-media-type"
            name="mediaType"
            required
            defaultValue={values?.mediaType ?? "game"}
            className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
          >
            {MEDIA_TYPES.map((mediaType) => (
              <option key={mediaType} value={mediaType}>
                {MEDIA_TYPE_LABELS[mediaType]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="author-media-franchise"
            className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
          >
            Серия
          </label>
          <select
            id="author-media-franchise"
            name="franchiseId"
            defaultValue={values?.franchiseId ?? ""}
            className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
          >
            <option value="">Без серии</option>
            {franchises.map((franchise) => (
              <option key={franchise.id} value={franchise.id}>
                {franchise.originalTitle
                  ? `${franchise.title} / ${franchise.originalTitle}`
                  : franchise.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="author-media-release-year"
            className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
          >
            Год
          </label>
          <input
            id="author-media-release-year"
            name="releaseYear"
            type="number"
            min="0"
            max="9999"
            defaultValue={values?.releaseYear ?? ""}
            className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
          />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <label
            htmlFor="author-media-cover-file"
            className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
          >
            Обложка
          </label>
          <CoverFileInput initialPreviewUrl={resolveCoverUrl(values?.coverUrl ?? null)} />
          <p className="text-xs text-zinc-500">JPG, PNG или WebP до 5 МБ.</p>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <label
            htmlFor="author-media-description"
            className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
          >
            Описание
          </label>
          <textarea
            id="author-media-description"
            name="description"
            rows={5}
            defaultValue={values?.description ?? ""}
            className="resize-y border border-zinc-300 bg-white px-3 py-2 text-sm leading-6 text-zinc-950 outline-none focus:border-zinc-950"
          />
        </div>
      </div>

      {errorMessage ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="h-10 border border-zinc-950 bg-zinc-950 px-4 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:bg-white hover:text-zinc-950"
        >
          {submitLabel}
        </button>
        <Link
          href="/author/media"
          className="flex h-10 items-center border border-zinc-300 bg-white px-4 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
        >
          Отмена
        </Link>
      </div>
    </form>
  );
}
