"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { CoverPicker } from "@/components/ui/cover-picker";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { SearchableFranchiseMultiSelect } from "@/components/ui/searchable-franchise-multi-select";
import type { getFranchiseOptions } from "@/db/queries/franchises";
import type { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import type { getMediaTypeOptions } from "@/db/queries/media-types";
import type { MediaType } from "@/lib/media/types";
import { resolveCoverUrl } from "@/lib/services/minio";
import { AuthorToasts, type AuthorToast } from "../author-toasts";
import { InlineFranchiseDialog } from "./inline-franchise-dialog";
import { getAuthorMediaFormErrorMessage } from "./messages";

type MediaItemFormValues = {
  id?: number;
  title?: string;
  originalTitle?: string | null;
  description?: string | null;
  mediaType?: MediaType;
  franchiseIds?: number[];
  mediaCarrierId?: number | null;
  releaseYear?: number | null;
  coverUrl?: string | null;
};

type MediaItemFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  franchises: Awaited<ReturnType<typeof getFranchiseOptions>>;
  mediaCarriers: Awaited<ReturnType<typeof getMediaCarrierOptions>>;
  mediaTypes: Awaited<ReturnType<typeof getMediaTypeOptions>>;
  canCreateFranchise?: boolean;
  values?: MediaItemFormValues;
  error?: string;
};

export function MediaItemForm({
  action,
  submitLabel,
  franchises,
  mediaCarriers,
  mediaTypes,
  canCreateFranchise = false,
  values,
}: MediaItemFormProps) {
  const [selectedMediaType, setSelectedMediaType] = useState<MediaType>(
    values?.mediaType ?? mediaTypes[0]?.code ?? "",
  );
  const [title, setTitle] = useState(values?.title ?? "");
  const [originalTitle, setOriginalTitle] = useState(values?.originalTitle ?? "");
  const [releaseYear, setReleaseYear] = useState(values?.releaseYear ? String(values.releaseYear) : "");
  const [selectedMediaCarrierId, setSelectedMediaCarrierId] = useState(
    values?.mediaCarrierId ? String(values.mediaCarrierId) : "",
  );
  const [selectedFranchiseIds, setSelectedFranchiseIds] = useState(
    values?.franchiseIds?.map(String) ?? [],
  );
  const [franchiseOptions, setFranchiseOptions] = useState(franchises);
  const [franchiseSelectResetKey, setFranchiseSelectResetKey] = useState(0);
  const [localErrorToast, setLocalErrorToast] = useState<AuthorToast | null>(null);
  const availableMediaCarriers = useMemo(
    () => mediaCarriers.filter((carrier) => carrier.mediaTypes.includes(selectedMediaType)),
    [mediaCarriers, selectedMediaType],
  );
  const toastMessages = localErrorToast ? [localErrorToast] : [];

  return (
    <form action={action} className="grid gap-5" noValidate>
      <AuthorToasts messages={toastMessages} />

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
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
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
            value={originalTitle}
            onChange={(event) => setOriginalTitle(event.currentTarget.value)}
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
                    carrier.mediaTypes.includes(nextMediaType),
                )
              ) {
                setSelectedMediaCarrierId("");
              }
            }}
          >
            {mediaTypes.map((mediaType) => (
              <option key={mediaType.code} value={mediaType.code}>
                {mediaType.name}
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
          <div className="flex items-start gap-2">
            <SearchableFranchiseMultiSelect
              key={franchiseSelectResetKey}
              id="author-media-franchise"
              name="franchiseIds"
              options={franchiseOptions}
              value={selectedFranchiseIds}
              onChange={setSelectedFranchiseIds}
            />
            {canCreateFranchise ? (
              <InlineFranchiseDialog
                onCreated={(franchise) => {
                  setFranchiseOptions((currentFranchises) => {
                    const nextFranchises = currentFranchises.some(
                      (currentFranchise) => currentFranchise.id === franchise.id,
                    )
                      ? currentFranchises
                      : [...currentFranchises, franchise];

                    return [...nextFranchises].sort((left, right) =>
                      left.title.localeCompare(right.title, "ru"),
                    );
                  });
                  setSelectedFranchiseIds((currentIds) =>
                    currentIds.includes(String(franchise.id))
                      ? currentIds
                      : [...currentIds, String(franchise.id)],
                  );
                  setFranchiseSelectResetKey((currentKey) => currentKey + 1);
                }}
              />
            ) : null}
          </div>
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
            value={releaseYear}
            onChange={(event) => setReleaseYear(event.currentTarget.value)}
          />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="author-media-cover-file">
            Обложка
          </Label>
          <CoverPicker
            inputId="author-media-cover-file"
            initialPreviewUrl={resolveCoverUrl(values?.coverUrl ?? null)}
            values={{
              title,
              originalTitle,
              mediaType: selectedMediaType,
              releaseYear,
            }}
            onFileRejected={(error) => {
              setLocalErrorToast({
                id: `${error}-${Date.now()}`,
                tone: "error",
                text: getAuthorMediaFormErrorMessage(error) ?? "Не удалось выбрать обложку.",
              });
            }}
            thumbnailClassName="h-28 w-20 object-cover"
          />
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
