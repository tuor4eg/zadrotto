import {
  verifyMediaMetadataCandidateToken,
  verifyMediaTitleSourceToken,
} from "@/lib/media/metadata-candidates";

export type MediaMetadataFormMutation =
  | { type: "keep" }
  | { type: "delete" }
  | { type: "reject" }
  | {
      type: "upsert";
      facts: Record<string, unknown>;
      sourceProvider: string;
      sourceExternalId: string;
      sourceUrl: string | null;
      fetchedAt: Date | null | undefined;
      providerSnapshot: {
        providerCode: string;
        externalId: string;
        mediaType: string;
        title: string;
        originalTitle: string | null;
        description: string | null;
        releaseYear: number | null;
        sourceUrl: string | null;
        facts: Record<string, unknown>;
      };
    };

export function resolveMediaMetadataFormMutation(input: {
  expectedMediaType: string;
  metadataCandidateToken: string | null;
  titleSourceToken: string | null;
  sourceChanged: boolean;
}): MediaMetadataFormMutation {
  const { expectedMediaType, metadataCandidateToken, sourceChanged, titleSourceToken } = input;

  if (!metadataCandidateToken && !sourceChanged) {
    return { type: "keep" };
  }

  const selectedSource = titleSourceToken
    ? verifyMediaTitleSourceToken(titleSourceToken)
    : null;

  if (titleSourceToken && !selectedSource) {
    return { type: "reject" };
  }

  if (selectedSource && selectedSource.mediaType !== expectedMediaType) {
    return { type: "reject" };
  }

  const metadata = metadataCandidateToken
    ? verifyMediaMetadataCandidateToken(metadataCandidateToken)
    : null;

  if (metadataCandidateToken && !metadata) {
    return { type: "reject" };
  }

  if (metadata && metadata.mediaType !== expectedMediaType) {
    return { type: "reject" };
  }

  if (metadata) {
    if (
      (sourceChanged && !selectedSource) ||
      (selectedSource &&
        (metadata.provider !== selectedSource.provider ||
          metadata.externalId !== selectedSource.externalId ||
          metadata.mediaType !== selectedSource.mediaType))
    ) {
      return { type: "reject" };
    }

    return {
      type: "upsert",
      facts: metadata.facts,
      sourceProvider: metadata.provider,
      sourceExternalId: metadata.externalId,
      sourceUrl: metadata.sourceUrl,
      fetchedAt: undefined,
      providerSnapshot: {
        providerCode: metadata.provider,
        externalId: metadata.externalId,
        mediaType: metadata.mediaType,
        title: selectedSource?.fields.title ?? metadata.externalId,
        originalTitle: selectedSource?.fields.originalTitle ?? null,
        description: selectedSource?.fields.description ?? null,
        releaseYear: selectedSource?.fields.releaseYear ?? null,
        sourceUrl: metadata.sourceUrl ?? selectedSource?.sourceUrl ?? null,
        facts: metadata.facts,
      },
    };
  }

  if (selectedSource) {
    return {
      type: "upsert",
      facts: {},
      sourceProvider: selectedSource.provider,
      sourceExternalId: selectedSource.externalId,
      sourceUrl: null,
      fetchedAt: null,
      providerSnapshot: {
        providerCode: selectedSource.provider,
        externalId: selectedSource.externalId,
        mediaType: selectedSource.mediaType,
        title: selectedSource.fields.title,
        originalTitle: selectedSource.fields.originalTitle,
        description: selectedSource.fields.description,
        releaseYear: selectedSource.fields.releaseYear,
        sourceUrl: selectedSource.sourceUrl,
        facts: {},
      },
    };
  }

  return sourceChanged ? { type: "delete" } : { type: "keep" };
}
