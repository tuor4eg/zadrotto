"use client";

import { RefreshCw, Save, Search } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Button } from "@/components/ui/button";
import { CoverPicker } from "@/components/ui/cover-picker";
import { Input, Label, Select } from "@/components/ui/form";
import {
  MediaMetadataFacts,
  type MediaMetadataFactsValue,
} from "@/components/ui/media-metadata-facts";
import { MediaTitleCandidatePicker } from "@/components/ui/media-title-candidate-picker";
import {
  MediaTitleAliasAddButton,
  MediaTitleAliasFields,
} from "@/components/ui/media-title-alias-fields";
import { SearchableFranchiseMultiSelect } from "@/components/ui/searchable-franchise-multi-select";
import { MediaItemDuplicateCheck } from "@/components/media-item-duplicate-check";
import type { getAuthorOptions } from "@/db/queries/authors";
import type { getFranchiseOptions } from "@/db/queries/franchises";
import type { getMediaCarrierOptions } from "@/db/queries/media-carriers";
import type { getMediaTypeOptions } from "@/db/queries/media-types";
import type { MediaTitleCandidate, SignedMediaTitleCandidate } from "@/lib/covers/types";
import { getMediaMetadataRefreshSource } from "@/lib/media/metadata-refresh-source";
import { rankMetadataRefreshCandidates } from "@/lib/media/rank-metadata-refresh-candidates";
import { getMediaTitleCandidateFormFields } from "@/lib/media/title-candidate-form";
import { getMediaTypeLabel, type MediaType } from "@/lib/media/types";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { InlineFranchiseDialog } from "./inline-franchise-dialog";
import { getAdminMediaErrorMessage } from "./messages";

type MediaFormValues = {
  id?: number;
  title?: string;
  originalTitle?: string | null;
  aliases?: string[];
  description?: string | null;
  mediaType?: MediaType;
  franchiseIds?: number[];
  mediaCarrierId?: number | null;
  releaseYear?: number | null;
  coverUrl?: string | null;
  coverSourceProvider?: string | null;
  coverSourceExternalId?: string | null;
  coverSourcePageUrl?: string | null;
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
  metadata?: MediaMetadataFactsValue | null;
  errorMessage?: string | null;
  successMessage?: string | null;
  maxTitleAliases: number;
};

type MediaTitleMetadataResponse = {
  metadata?: (MediaMetadataFactsValue & { metadataCandidateToken?: string | null }) | null;
};

type MediaTitleCandidatesResponse = {
  candidates?: SignedMediaTitleCandidate[];
};

type MediaTitleMetadataRequest = Pick<MediaTitleCandidate, "externalId" | "mediaType" | "provider">;

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

export function AdminMediaForm({
  action,
  submitLabel,
  authors,
  franchises,
  mediaCarriers,
  mediaTypes,
  requireAuthor = false,
  values,
  metadata = null,
  errorMessage,
  successMessage,
  maxTitleAliases,
}: AdminMediaFormProps) {
  const hasAuthors = authors.length > 0;
  const [selectedMediaType, setSelectedMediaType] = useState<MediaType>(
    values?.mediaType ?? mediaTypes[0]?.code ?? "",
  );
  const isEditing = Boolean(values?.id);
  const selectedMediaTypeLabel = selectedMediaType
    ? getMediaTypeLabel(selectedMediaType, mediaTypes)
    : "Тип не выбран";
  const [title, setTitle] = useState(values?.title ?? "");
  const [originalTitle, setOriginalTitle] = useState(values?.originalTitle ?? "");
  const [aliases, setAliases] = useState(values?.aliases ?? []);
  const [description, setDescription] = useState(values?.description ?? "");
  const [releaseYear, setReleaseYear] = useState(values?.releaseYear ? String(values.releaseYear) : "");
  const [canSearchCoverCandidates, setCanSearchCoverCandidates] = useState(isEditing);
  const [selectedMetadata, setSelectedMetadata] = useState<MediaMetadataFactsValue | null>(metadata);
  const [metadataCandidateToken, setMetadataCandidateToken] = useState("");
  const [selectedTitleSource, setSelectedTitleSource] = useState<
    Pick<MediaTitleCandidate, "provider" | "externalId"> & { token: string } | null
  >(() =>
    metadata?.sourceProvider && metadata.sourceExternalId
      ? {
          provider: metadata.sourceProvider as MediaTitleCandidate["provider"],
          externalId: metadata.sourceExternalId,
          token: "",
        }
      : null,
  );
  const [hasSelectedNewTitleSource, setHasSelectedNewTitleSource] = useState(false);
  const metadataRequestVersionRef = useRef(0);
  const [isTitleProviderSearchOpen, setIsTitleProviderSearchOpen] = useState(!isEditing);
  const [titleProviderSearchKey, setTitleProviderSearchKey] = useState(0);
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);
  const [selectedMediaCarrierId, setSelectedMediaCarrierId] = useState(
    values?.mediaCarrierId ? String(values.mediaCarrierId) : "",
  );
  const [selectedFranchiseIds, setSelectedFranchiseIds] = useState(
    values?.franchiseIds?.map(String) ?? [],
  );
  const [franchiseOptions, setFranchiseOptions] = useState(franchises);
  const [franchiseSelectResetKey, setFranchiseSelectResetKey] = useState(0);
  const [localErrorToast, setLocalErrorToast] = useState<AdminToast | null>(null);
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);
  const availableMediaCarriers = useMemo(
    () => mediaCarriers.filter((carrier) => carrier.mediaTypes.includes(selectedMediaType)),
    [mediaCarriers, selectedMediaType],
  );
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
    ...(localErrorToast ? [localErrorToast] : []),
  ] satisfies AdminToast[];
  const metadataRefreshSource = getMediaMetadataRefreshSource({
    mediaType: selectedMediaType,
    titleSource: selectedTitleSource,
    metadata: selectedMetadata,
  });
  const canRefreshMetadata = Boolean(metadataRefreshSource) || title.trim().length >= 2;
  const handleDuplicateBlockedChange = useCallback((blocked: boolean) => {
    setDuplicateBlocked(blocked);
  }, []);

  async function refreshMetadata() {
    if (!canRefreshMetadata || isRefreshingMetadata) {
      return;
    }

    const requestVersion = metadataRequestVersionRef.current + 1;
    metadataRequestVersionRef.current = requestVersion;
    setIsRefreshingMetadata(true);
    setLocalErrorToast(null);

    try {
      const refreshSources = metadataRefreshSource
        ? [metadataRefreshSource]
        : rankMetadataRefreshCandidates(
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
      let nextTitleSource: Pick<
        SignedMediaTitleCandidate,
        "provider" | "externalId" | "titleSourceToken"
      > | null = null;

      for (const refreshSource of refreshSources) {
        nextMetadata = await fetchMediaTitleMetadata({
          provider: refreshSource.provider,
          externalId: refreshSource.externalId,
          mediaType: refreshSource.mediaType,
        });

        if (nextMetadata) {
          if (
            "titleSourceToken" in refreshSource &&
            typeof refreshSource.titleSourceToken === "string"
          ) {
            nextTitleSource = {
              provider: refreshSource.provider,
              externalId: refreshSource.externalId,
              titleSourceToken: refreshSource.titleSourceToken,
            };
          }
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

      if (metadataRequestVersionRef.current === requestVersion) {
        setSelectedMetadata(nextMetadata);
        setMetadataCandidateToken(nextMetadata.metadataCandidateToken ?? "");
        if (nextTitleSource) {
          setSelectedTitleSource({
            provider: nextTitleSource.provider,
            externalId: nextTitleSource.externalId,
            token: nextTitleSource.titleSourceToken,
          });
          setHasSelectedNewTitleSource(true);
        }
      }
    } finally {
      setIsRefreshingMetadata(false);
    }
  }

  return (
    <form action={action} className="grid gap-5" noValidate>
      <AdminToasts clearParams={["created", "error", "updated"]} messages={toastMessages} />

      {values?.id ? <input type="hidden" name="mediaItemId" value={values.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor={isEditing ? undefined : "admin-media-type"}>Тип медиа</Label>
          {isEditing ? (
            <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-800">
              {selectedMediaTypeLabel}
            </div>
          ) : (
            <>
              <Select
                id="admin-media-type"
                name="mediaType"
                value={selectedMediaType}
                onChange={(event) => {
                  const nextMediaType = event.currentTarget.value as MediaType;

                  metadataRequestVersionRef.current += 1;
                  setSelectedMediaType(nextMediaType);
                  setSelectedTitleSource(null);
                  setHasSelectedNewTitleSource(true);
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
                }}
                required
              >
                {mediaTypes.map((mediaType) => (
                  <option key={mediaType.code} value={mediaType.code}>
                    {mediaType.name}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-stone-500">
                Тип выбирается при создании записи и потом не меняется
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="admin-media-title">Название</Label>
            {isEditing ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={title.trim().length < 2}
                onClick={() => {
                  setTitleProviderSearchKey((key) => key + 1);
                  setIsTitleProviderSearchOpen(true);
                }}
              >
                <Search className="size-4" />
                Найти у провайдера
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Input
              id="admin-media-title"
              name="title"
              type="text"
              value={title}
              onChange={(event) => {
                metadataRequestVersionRef.current += 1;
                setTitle(event.currentTarget.value);
                setSelectedTitleSource(null);
                setHasSelectedNewTitleSource(true);
                setCanSearchCoverCandidates(isEditing);
                setSelectedMetadata(null);
                setMetadataCandidateToken("");
              }}
              required
            />
            {aliases.length === 0 ? (
              <MediaTitleAliasAddButton
                aliases={aliases}
                limit={maxTitleAliases}
                onChange={setAliases}
                tooltipVariant="admin"
              />
            ) : null}
          </div>
          <MediaTitleAliasFields
            aliases={aliases}
            idPrefix="admin-media-title-alias"
            limit={maxTitleAliases}
            onChange={setAliases}
            tooltipVariant="admin"
          />
          {isTitleProviderSearchOpen ? (
            <MediaTitleCandidatePicker
              key={titleProviderSearchKey}
              mediaType={selectedMediaType}
              query={title}
              onSelect={(candidate) => {
                const nextFields = getMediaTitleCandidateFormFields(
                  candidate,
                  { description, originalTitle, releaseYear, title },
                  isEditing,
                );
                setTitle(nextFields.title);
                setOriginalTitle(nextFields.originalTitle);
                setReleaseYear(nextFields.releaseYear);
                setDescription(nextFields.description);
                setSelectedTitleSource({
                  provider: candidate.provider,
                  externalId: candidate.externalId,
                  token: candidate.titleSourceToken,
                });
                setHasSelectedNewTitleSource(true);
                setCanSearchCoverCandidates(true);
                const requestVersion = metadataRequestVersionRef.current + 1;
                metadataRequestVersionRef.current = requestVersion;
                setSelectedMetadata(null);
                setMetadataCandidateToken("");
                if (isEditing) setIsTitleProviderSearchOpen(false);

                void fetchMediaTitleMetadata(candidate)
                  .then((metadata) => {
                    if (metadataRequestVersionRef.current !== requestVersion || !metadata) {
                      return;
                    }
                    setSelectedMetadata(metadata);
                    setMetadataCandidateToken(metadata.metadataCandidateToken ?? "");
                  })
                  .catch(() => undefined);
              }}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="admin-media-original-title">Оригинальное название</Label>
          <Input
            id="admin-media-original-title"
            name="originalTitle"
            type="text"
            value={originalTitle}
            onChange={(event) => {
              metadataRequestVersionRef.current += 1;
              setOriginalTitle(event.currentTarget.value);
              setSelectedTitleSource(null);
              setHasSelectedNewTitleSource(true);
              setSelectedMetadata(null);
              setMetadataCandidateToken("");
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-media-carrier">Носитель</Label>
          <Select
            id="admin-media-carrier"
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
          <Label htmlFor="admin-media-franchise">Серия</Label>
          <div className="flex items-start gap-2">
            <SearchableFranchiseMultiSelect
              key={franchiseSelectResetKey}
              id="admin-media-franchise"
              name="franchiseIds"
              options={franchiseOptions}
              value={selectedFranchiseIds}
              onChange={setSelectedFranchiseIds}
            />
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
          </div>
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
            onChange={(event) => {
              metadataRequestVersionRef.current += 1;
              setReleaseYear(event.currentTarget.value);
              setSelectedTitleSource(null);
              setHasSelectedNewTitleSource(true);
              setSelectedMetadata(null);
              setMetadataCandidateToken("");
            }}
          />
        </div>

        <div className="md:col-span-2">
          <MediaItemDuplicateCheck
            mediaItemId={values?.id}
            mediaType={selectedMediaType}
            title={title}
            originalTitle={originalTitle}
            aliases={aliases}
            releaseYear={releaseYear}
            onBlockedChange={handleDuplicateBlockedChange}
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
            canSearchCandidates={canSearchCoverCandidates}
            inputId="admin-media-cover-file"
            initialPreviewUrl={values?.coverUrl ?? null}
            values={{
              title,
              originalTitle,
              mediaType: selectedMediaType,
              releaseYear,
              titleSource: selectedTitleSource,
            }}
            onFileRejected={(error) => {
              setLocalErrorToast({
                id: `${error}-${Date.now()}`,
                tone: "error",
                text: getAdminMediaErrorMessage(error) ?? "Не удалось выбрать обложку.",
              });
            }}
          />
          <p className="text-xs text-stone-500">JPG, PNG или WebP до 5 МБ.</p>
        </div>

        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="admin-media-description">Описание</Label>
          <AutoResizeTextarea
            id="admin-media-description"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </div>

        <div className="md:col-span-2">
          <input type="hidden" name="metadataCandidateToken" value={metadataCandidateToken} />
          <input
            type="hidden"
            name="metadataTitleSourceToken"
            value={selectedTitleSource?.token ?? ""}
          />
          <input
            type="hidden"
            name="metadataSourceChanged"
            value={hasSelectedNewTitleSource ? "1" : ""}
          />
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

      <div>
        <Button type="submit" disabled={(requireAuthor && !hasAuthors) || duplicateBlocked}>
          <Save />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
