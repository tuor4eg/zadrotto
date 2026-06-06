"use client";

import { Save } from "lucide-react";
import { useMemo, useState } from "react";

import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Button } from "@/components/ui/button";
import { CoverPicker } from "@/components/ui/cover-picker";
import { Input, Label, Select } from "@/components/ui/form";
import type { getAuthorOptions } from "@/db/queries/authors";
import type { getFranchiseOptions } from "@/db/queries/franchises";
import type { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import type { getMediaTypeOptions } from "@/db/queries/media-types";
import type { MediaType } from "@/lib/media-types";
import { AdminToasts, type AdminToast } from "../admin-toasts";

type MediaFormValues = {
  id?: number;
  title?: string;
  originalTitle?: string | null;
  description?: string | null;
  mediaType?: MediaType;
  franchiseId?: number | null;
  mediaCarrierId?: number | null;
  releaseYear?: number | null;
  coverUrl?: string | null;
  createdByAuthorId?: number | null;
};

type AdminMediaFormProps = {
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  authors: Awaited<ReturnType<typeof getAuthorOptions>>;
  franchises: Awaited<ReturnType<typeof getFranchiseOptions>>;
  mediaCarriers: Awaited<ReturnType<typeof getMediaCarrierOptions>>;
  mediaTypes: Awaited<ReturnType<typeof getMediaTypeOptions>>;
  requireAuthor?: boolean;
  values?: MediaFormValues;
  errorMessage?: string | null;
  successMessage?: string | null;
};

export function AdminMediaForm({
  action,
  submitLabel,
  authors,
  franchises,
  mediaCarriers,
  mediaTypes,
  requireAuthor = false,
  values,
  errorMessage,
  successMessage,
}: AdminMediaFormProps) {
  const hasAuthors = authors.length > 0;
  const [selectedMediaType, setSelectedMediaType] = useState<MediaType>(
    values?.mediaType ?? mediaTypes[0]?.code ?? "",
  );
  const [title, setTitle] = useState(values?.title ?? "");
  const [originalTitle, setOriginalTitle] = useState(values?.originalTitle ?? "");
  const [releaseYear, setReleaseYear] = useState(values?.releaseYear ? String(values.releaseYear) : "");
  const [selectedMediaCarrierId, setSelectedMediaCarrierId] = useState(
    values?.mediaCarrierId ? String(values.mediaCarrierId) : "",
  );
  const availableMediaCarriers = useMemo(
    () => mediaCarriers.filter((carrier) => carrier.mediaType === selectedMediaType),
    [mediaCarriers, selectedMediaType],
  );
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[];

  return (
    <form action={action} className="grid gap-5" noValidate>
      <AdminToasts clearParams={["created", "error", "updated"]} messages={toastMessages} />

      {values?.id ? <input type="hidden" name="mediaItemId" value={values.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="admin-media-title">Название</Label>
          <Input
            id="admin-media-title"
            name="title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="admin-media-original-title">Оригинальное название</Label>
          <Input
            id="admin-media-original-title"
            name="originalTitle"
            type="text"
            value={originalTitle}
            onChange={(event) => setOriginalTitle(event.currentTarget.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-media-type">Тип медиа</Label>
          <Select
            id="admin-media-type"
            name="mediaType"
            value={selectedMediaType}
            onChange={(event) => {
              const nextMediaType = event.currentTarget.value as MediaType;

              setSelectedMediaType(nextMediaType);

              if (
                selectedMediaCarrierId &&
                !mediaCarriers.some(
                  (carrier) =>
                    String(carrier.id) === selectedMediaCarrierId &&
                    carrier.mediaType === nextMediaType,
                )
              ) {
                setSelectedMediaCarrierId("");
              }
            }}
            required
          >
            {mediaTypes.map((mediaType) => (
              <option key={mediaType.code} value={mediaType.code}>
                {mediaType.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-media-carrier">Носитель</Label>
          <Select
            id="admin-media-carrier"
            name="mediaCarrierId"
            value={selectedMediaCarrierId}
            onChange={(event) => setSelectedMediaCarrierId(event.currentTarget.value)}
          >
            <option value="">Без носителя</option>
            {availableMediaCarriers.map((carrier) => (
              <option key={carrier.id} value={carrier.id}>
                {carrier.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-media-franchise">Серия</Label>
          <Select
            id="admin-media-franchise"
            name="franchiseId"
            defaultValue={values?.franchiseId ?? ""}
          >
            <option value="">Без серии</option>
            {franchises.map((franchise) => (
              <option key={franchise.id} value={franchise.id}>
                {franchise.originalTitle
                  ? `${franchise.title} / ${franchise.originalTitle}`
                  : franchise.title}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-media-release-year">Год</Label>
          <Input
            id="admin-media-release-year"
            name="releaseYear"
            type="number"
            min="0"
            max="9999"
            value={releaseYear}
            onChange={(event) => setReleaseYear(event.currentTarget.value)}
          />
        </div>

        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="admin-media-author">Автор</Label>
          <Select
            id="admin-media-author"
            name="authorId"
            defaultValue={values?.createdByAuthorId ?? ""}
            required={requireAuthor}
            disabled={requireAuthor && !hasAuthors}
          >
            {requireAuthor ? null : <option value="">Без автора</option>}
            {authors.map((author) => (
              <option key={author.id} value={author.id}>
                {author.isSystem ? `${author.name} (системный)` : author.name}
              </option>
            ))}
          </Select>
          {requireAuthor && !hasAuthors ? (
            <p className="text-xs text-stone-500">Сначала создай хотя бы одного автора.</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="admin-media-cover-file">Обложка</Label>
          <CoverPicker
            inputId="admin-media-cover-file"
            initialPreviewUrl={values?.coverUrl ?? null}
            values={{
              title,
              originalTitle,
              mediaType: selectedMediaType,
              releaseYear,
            }}
          />
          <p className="text-xs text-stone-500">JPG, PNG или WebP до 5 МБ.</p>
        </div>

        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="admin-media-description">Описание</Label>
          <AutoResizeTextarea
            id="admin-media-description"
            name="description"
            defaultValue={values?.description ?? ""}
          />
        </div>
      </div>

      <div>
        <Button type="submit" disabled={requireAuthor && !hasAuthors}>
          <Save />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
