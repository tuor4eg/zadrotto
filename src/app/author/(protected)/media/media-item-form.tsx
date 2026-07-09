"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { CoverPicker } from "@/components/ui/cover-picker";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import {
  MediaMetadataFacts,
  type MediaMetadataFactsValue,
} from "@/components/ui/media-metadata-facts";
import { MediaTitleCandidatePicker } from "@/components/ui/media-title-candidate-picker";
import { RatingExperienceFields } from "@/components/ui/rating-experience-fields";
import { RatingScoreButtons } from "@/components/ui/rating-score-buttons";
import { SearchableFranchiseMultiSelect } from "@/components/ui/searchable-franchise-multi-select";
import type { getFranchiseOptions } from "@/db/queries/franchises";
import type { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import type { getMediaTypeOptions } from "@/db/queries/media-types";
import { cn } from "@/lib/common/utils";
import type { MediaTitleCandidate } from "@/lib/covers/types";
import { getMediaMetadataRefreshSource } from "@/lib/media/metadata-refresh-source";
import { getMediaTypeLabel, type MediaType } from "@/lib/media/types";
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
  coverSourceProvider?: string | null;
  coverSourceExternalId?: string | null;
  coverSourcePageUrl?: string | null;
};

type MediaItemFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  franchises: Awaited<ReturnType<typeof getFranchiseOptions>>;
  mediaCarriers: Awaited<ReturnType<typeof getMediaCarrierOptions>>;
  mediaTypes: Awaited<ReturnType<typeof getMediaTypeOptions>>;
  cancelHref?: string;
  canCreateFranchise?: boolean;
  createAndSubmitLabel?: string;
  errorParamName?: string;
  errorRedirectTo?: string;
  publishedSuccessRedirectTo?: string;
  submittedSuccessRedirectTo?: string;
  values?: MediaItemFormValues;
  metadata?: MediaMetadataFactsValue | null;
  onCancel?: () => void;
  successRedirectTo?: string;
  error?: string;
};

type MediaTitleMetadataResponse = {
  metadata?: (MediaMetadataFactsValue & { metadataCandidateToken?: string | null }) | null;
};

type MediaTitleCandidatesResponse = {
  candidates?: MediaTitleCandidate[];
};

type MediaTitleMetadataRequest = Pick<MediaTitleCandidate, "externalId" | "mediaType" | "provider">;

function normalizeCandidateTitle(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

async function fetchMediaTitleCandidates(input: { mediaType: MediaType; query: string }) {
  const response = await fetch("/api/media-title-candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json().catch(() => ({}))) as MediaTitleCandidatesResponse;

  return data.candidates ?? [];
}

async function fetchMediaTitleMetadata(candidate: MediaTitleMetadataRequest) {
  const response = await fetch("/api/media-title-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: candidate.provider,
      externalId: candidate.externalId,
      mediaType: candidate.mediaType,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json().catch(() => ({}))) as MediaTitleMetadataResponse;

  return data.metadata ?? null;
}

function getRankedMetadataRefreshCandidates(
  candidates: MediaTitleCandidate[],
  input: {
    originalTitle: string;
    releaseYear: string;
    title: string;
  },
) {
  const normalizedTitle = normalizeCandidateTitle(input.title);
  const normalizedOriginalTitle = normalizeCandidateTitle(input.originalTitle);
  const releaseYear = Number(input.releaseYear);
  const hasOriginalTitle = normalizedOriginalTitle.length > 0;
  const hasReleaseYear = input.releaseYear.trim().length > 0 && Number.isInteger(releaseYear);
  const rankedCandidates = [
    ...candidates.filter(
      (candidate) =>
        hasReleaseYear &&
        candidate.releaseYear === releaseYear &&
        (normalizeCandidateTitle(candidate.title) === normalizedTitle ||
          (hasOriginalTitle &&
            normalizeCandidateTitle(candidate.originalTitle) === normalizedOriginalTitle)),
    ),
    ...candidates.filter(
      (candidate) =>
        normalizeCandidateTitle(candidate.title) === normalizedTitle ||
        (hasOriginalTitle &&
          normalizeCandidateTitle(candidate.originalTitle) === normalizedOriginalTitle),
    ),
    ...candidates.filter((candidate) => hasReleaseYear && candidate.releaseYear === releaseYear),
    ...candidates,
  ];
  const seen = new Set<string>();

  return rankedCandidates.filter((candidate) => {
    const key = `${candidate.provider}:${candidate.externalId}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function MediaItemForm({
  action,
  submitLabel,
  cancelHref = "/author/media",
  franchises,
  mediaCarriers,
  mediaTypes,
  canCreateFranchise = false,
  createAndSubmitLabel,
  errorParamName,
  errorRedirectTo,
  publishedSuccessRedirectTo,
  submittedSuccessRedirectTo,
  values,
  metadata = null,
  onCancel,
  successRedirectTo,
}: MediaItemFormProps) {
  const isEditing = Boolean(values?.id);
  const [selectedMediaType, setSelectedMediaType] = useState<MediaType>(
    values?.mediaType ?? mediaTypes[0]?.code ?? "",
  );
  const selectedMediaTypeLabel = selectedMediaType
    ? getMediaTypeLabel(selectedMediaType, mediaTypes)
    : "Тип не выбран";
  const [title, setTitle] = useState(values?.title ?? "");
  const [originalTitle, setOriginalTitle] = useState(values?.originalTitle ?? "");
  const [description, setDescription] = useState(values?.description ?? "");
  const [releaseYear, setReleaseYear] = useState(() =>
    values?.releaseYear != null
      ? String(values.releaseYear)
      : isEditing
        ? ""
        : String(new Date().getFullYear()),
  );
  const [initialRatingScore, setInitialRatingScore] = useState<number | null>(null);
  const [canSearchCoverCandidates, setCanSearchCoverCandidates] = useState(isEditing);
  const [selectedMetadata, setSelectedMetadata] = useState<MediaMetadataFactsValue | null>(metadata);
  const [metadataCandidateToken, setMetadataCandidateToken] = useState("");
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);
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
  const metadataRefreshSource = getMediaMetadataRefreshSource({
    mediaType: selectedMediaType,
    metadata: selectedMetadata,
    coverSource: {
      provider: values?.coverSourceProvider,
      externalId: values?.coverSourceExternalId,
      pageUrl: values?.coverSourcePageUrl,
    },
  });
  const canRefreshMetadata = Boolean(metadataRefreshSource) || title.trim().length >= 2;
  const selectedReleaseYear = /^\d+$/.test(releaseYear) ? Number(releaseYear) : null;

  function selectMediaType(nextMediaType: MediaType) {
    setSelectedMediaType(nextMediaType);
    setCanSearchCoverCandidates(false);
    setSelectedMetadata(null);
    setMetadataCandidateToken("");

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
  }

  async function refreshMetadata() {
    if (!canRefreshMetadata || isRefreshingMetadata) {
      return;
    }

    setIsRefreshingMetadata(true);
    setLocalErrorToast(null);

    try {
      const refreshSources = metadataRefreshSource
        ? [metadataRefreshSource]
        : getRankedMetadataRefreshCandidates(
            await fetchMediaTitleCandidates({
              mediaType: selectedMediaType,
              query: title,
            }),
            { originalTitle, releaseYear, title },
          );

      if (refreshSources.length === 0) {
        setLocalErrorToast({
          id: `metadata-refresh-${Date.now()}`,
          tone: "error",
          text: "Не удалось найти тайтл у провайдера.",
        });
        return;
      }

      let nextMetadata: Awaited<ReturnType<typeof fetchMediaTitleMetadata>> = null;

      for (const refreshSource of refreshSources) {
        nextMetadata = await fetchMediaTitleMetadata({
          provider: refreshSource.provider,
          externalId: refreshSource.externalId,
          mediaType: refreshSource.mediaType,
        });

        if (nextMetadata) {
          break;
        }
      }

      if (!nextMetadata) {
        setLocalErrorToast({
          id: `metadata-refresh-${Date.now()}`,
          tone: "error",
          text: "Не удалось обновить факты.",
        });
        return;
      }

      setSelectedMetadata(nextMetadata);
      setMetadataCandidateToken(nextMetadata.metadataCandidateToken ?? "");
    } finally {
      setIsRefreshingMetadata(false);
    }
  }

  return (
    <form action={action} className="grid gap-5" noValidate>
      <AuthorToasts messages={toastMessages} />

      {values?.id ? <input type="hidden" name="mediaItemId" value={values.id} /> : null}
      {successRedirectTo ? (
        <input type="hidden" name="successRedirectTo" value={successRedirectTo} />
      ) : null}
      {submittedSuccessRedirectTo ? (
        <input type="hidden" name="submittedSuccessRedirectTo" value={submittedSuccessRedirectTo} />
      ) : null}
      {publishedSuccessRedirectTo ? (
        <input type="hidden" name="publishedSuccessRedirectTo" value={publishedSuccessRedirectTo} />
      ) : null}
      {errorRedirectTo ? (
        <input type="hidden" name="errorRedirectTo" value={errorRedirectTo} />
      ) : null}
      {errorParamName ? (
        <input type="hidden" name="errorParamName" value={errorParamName} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <Label id="author-media-type-label" htmlFor={isEditing ? undefined : "author-media-type"}>
            Тип медиа
          </Label>
          {isEditing ? (
            <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-800">
              {selectedMediaTypeLabel}
            </div>
          ) : (
            <>
              <input
                id="author-media-type"
                name="mediaType"
                required
                type="hidden"
                value={selectedMediaType}
              />
              <div
                aria-labelledby="author-media-type-label"
                className="flex flex-wrap gap-2"
              >
                {mediaTypes.map((mediaType) => (
                  <button
                    key={mediaType.code}
                    type="button"
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950",
                      selectedMediaType === mediaType.code
                        ? "border-stone-950 bg-stone-950 text-stone-50"
                        : "border-stone-200 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50 hover:text-stone-950",
                    )}
                    aria-pressed={selectedMediaType === mediaType.code}
                    onClick={() => selectMediaType(mediaType.code)}
                  >
                    {mediaType.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-stone-500">
                Тип выбирается при создании записи и потом не меняется.
              </p>
            </>
          )}
        </div>

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
            onChange={(event) => {
              setTitle(event.currentTarget.value);
              setCanSearchCoverCandidates(isEditing);
              setSelectedMetadata(isEditing ? metadata : null);
              setMetadataCandidateToken("");
            }}
          />
          {!isEditing ? (
            <MediaTitleCandidatePicker
              mediaType={selectedMediaType}
              query={title}
              onSelect={(candidate) => {
                setTitle(candidate.title);
                setOriginalTitle(candidate.originalTitle ?? "");
                setReleaseYear(candidate.releaseYear ? String(candidate.releaseYear) : "");
                setDescription(candidate.description ?? "");
                setCanSearchCoverCandidates(true);
                setSelectedMetadata(null);
                setMetadataCandidateToken("");

                void fetchMediaTitleMetadata(candidate).then((metadata) => {
                  setSelectedMetadata(metadata);
                  setMetadataCandidateToken(metadata?.metadataCandidateToken ?? "");
                });
              }}
            />
          ) : null}
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
          <Label htmlFor="author-media-carrier">
            Носитель
          </Label>
          <Select
            id="author-media-carrier"
            name="mediaCarrierId"
            value={selectedMediaCarrierId}
            onChange={(event) => setSelectedMediaCarrierId(event.currentTarget.value)}
          >
            <option value="">Не выбран</option>
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
            canSearchCandidates={canSearchCoverCandidates}
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
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </div>

        {!isEditing ? (
          <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
            <div className="rounded-md border border-stone-300/80 bg-stone-50/50 p-3">
              <div className="flex flex-col gap-5">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                    Моя оценка
                  </span>
                </div>
                {initialRatingScore !== null ? (
                  <input type="hidden" name="ratingScore" value={initialRatingScore / 10} />
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <RatingScoreButtons
                    selectedScore={initialRatingScore}
                    variant="archive"
                    onScoreClick={(score, { isSelected }) => {
                      setInitialRatingScore(isSelected ? null : score);
                    }}
                  />
                </div>
                <RatingExperienceFields releaseYear={selectedReleaseYear} variant="archive" />
              </div>
            </div>
          </div>
        ) : null}

        <div className="sm:col-span-2 lg:col-span-3">
          <input type="hidden" name="metadataCandidateToken" value={metadataCandidateToken} />
          {isEditing ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canRefreshMetadata || isRefreshingMetadata}
                onClick={() => void refreshMetadata()}
              >
                <RefreshCw className={isRefreshingMetadata ? "animate-spin" : undefined} />
                {isRefreshingMetadata ? "Обновляем факты" : "Обновить факты"}
              </Button>
              {!metadataRefreshSource ? (
                <span className="text-xs text-stone-500">
                  Источник будет найден по названию.
                </span>
              ) : null}
            </div>
          ) : null}
          <MediaMetadataFacts metadata={selectedMetadata} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="draft">
          {submitLabel}
        </Button>
        {!isEditing && createAndSubmitLabel ? (
          <Button type="submit" variant="positive" name="intent" value="submit">
            {createAndSubmitLabel}
          </Button>
        ) : null}
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Отмена
          </Button>
        ) : (
          <Link
            href={cancelHref}
            className={buttonVariants({ variant: "outline" })}
          >
            Отмена
          </Link>
        )}
      </div>
    </form>
  );
}
