"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import type { getFranchiseOptions } from "@/db/queries/franchises";
import type { getMediaCarrierOptions } from "@/db/queries/media-carriers";
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
  mediaCarrierId?: number | null;
  releaseYear?: number | null;
  coverUrl?: string | null;
};

type MediaItemFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  franchises: Awaited<ReturnType<typeof getFranchiseOptions>>;
  mediaCarriers: Awaited<ReturnType<typeof getMediaCarrierOptions>>;
  values?: MediaItemFormValues;
  error?: string;
};

export function MediaItemForm({
  action,
  submitLabel,
  franchises,
  mediaCarriers,
  values,
}: MediaItemFormProps) {
  const [selectedMediaType, setSelectedMediaType] = useState<MediaType>(
    values?.mediaType ?? "game",
  );
  const [selectedMediaCarrierId, setSelectedMediaCarrierId] = useState(
    values?.mediaCarrierId ? String(values.mediaCarrierId) : "",
  );
  const availableMediaCarriers = useMemo(
    () => mediaCarriers.filter((carrier) => carrier.mediaType === selectedMediaType),
    [mediaCarriers, selectedMediaType],
  );

  return (
    <form action={action} className="grid gap-5" noValidate>
      {values?.id ? <input type="hidden" name="mediaItemId" value={values.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="author-media-title">
            Название
          </Label>
          <Input
            id="author-media-title"
            name="title"
            type="text"
            required
            defaultValue={values?.title ?? ""}
          />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="author-media-original-title">
            Оригинальное название
          </Label>
          <Input
            id="author-media-original-title"
            name="originalTitle"
            type="text"
            defaultValue={values?.originalTitle ?? ""}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="author-media-type">
            Тип медиа
          </Label>
          <Select
            id="author-media-type"
            name="mediaType"
            required
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
          >
            {MEDIA_TYPES.map((mediaType) => (
              <option key={mediaType} value={mediaType}>
                {MEDIA_TYPE_LABELS[mediaType]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="author-media-carrier">
            Носитель
          </Label>
          <Select
            id="author-media-carrier"
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
          <Label htmlFor="author-media-franchise">
            Серия
          </Label>
          <Select
            id="author-media-franchise"
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
          <Label htmlFor="author-media-release-year">
            Год
          </Label>
          <Input
            id="author-media-release-year"
            name="releaseYear"
            type="number"
            min="0"
            max="9999"
            defaultValue={values?.releaseYear ?? ""}
          />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="author-media-cover-file">
            Обложка
          </Label>
          <CoverFileInput initialPreviewUrl={resolveCoverUrl(values?.coverUrl ?? null)} />
          <p className="text-xs text-stone-500">JPG, PNG или WebP до 5 МБ.</p>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="author-media-description">
            Описание
          </Label>
          <Textarea
            id="author-media-description"
            name="description"
            rows={5}
            defaultValue={values?.description ?? ""}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit">
          {submitLabel}
        </Button>
        <Link
          href="/author/media"
          className={buttonVariants({ variant: "outline" })}
        >
          Отмена
        </Link>
      </div>
    </form>
  );
}
