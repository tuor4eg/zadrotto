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
    };

export function resolveMediaMetadataFormMutation(input: {
  metadataCandidateToken: string | null;
  titleSourceToken: string | null;
  sourceChanged: boolean;
}): MediaMetadataFormMutation {
  const { metadataCandidateToken, sourceChanged, titleSourceToken } = input;

  if (!metadataCandidateToken && !sourceChanged) {
    return { type: "keep" };
  }

  const selectedSource = titleSourceToken
    ? verifyMediaTitleSourceToken(titleSourceToken)
    : null;

  if (titleSourceToken && !selectedSource) {
    return { type: "reject" };
  }

  const metadata = metadataCandidateToken
    ? verifyMediaMetadataCandidateToken(metadataCandidateToken)
    : null;

  if (metadataCandidateToken && !metadata) {
    return { type: "reject" };
  }

  if (metadata) {
    if (
      (sourceChanged && !selectedSource) ||
      (selectedSource &&
        (metadata.provider !== selectedSource.provider ||
          metadata.externalId !== selectedSource.externalId))
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
    };
  }

  return sourceChanged ? { type: "delete" } : { type: "keep" };
}
