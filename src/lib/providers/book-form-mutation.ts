import "server-only";
import { prepareComicVineSnapshotReferences } from "./comic-vine-service";
import { prepareTmdbSeriesSnapshotReferences } from "./tmdb-series-service";
import { prepareTmdbFilmSnapshotReferences } from "./tmdb-film-service";
import type { MediaMetadataFormMutation } from "@/lib/media/metadata-form-mutation";
import { isBookSnapshotProvider, prepareBookSnapshotReferences } from "./book-service";

/** Old signed selections are accepted only after obtaining full server-side evidence. */
export async function validateBookFormMutation(mutation:MediaMetadataFormMutation,mediaType:string):Promise<MediaMetadataFormMutation> {
  if (mutation.type!=="upsert") return mutation;
  const film = mediaType === "film" && mutation.sourceProvider === "tmdb";
  const series = mediaType === "series" && mutation.sourceProvider === "tmdb";
  const tmdb = film || series;
  const comic = mediaType === "comic" && mutation.sourceProvider === "comic-vine";
  // A source-only selection contains no imported metadata. Preserve the existing
  // ability to save it when the details request was unavailable.
  if ((tmdb || comic) && !mutation.snapshotReferences && mutation.fetchedAt === null && Object.keys(mutation.facts).length === 0) return mutation;
  if (!tmdb && !comic && (mediaType!=="book" || !isBookSnapshotProvider(mutation.sourceProvider))) return mutation;
  try {
    let refs=mutation.snapshotReferences;
    if (!refs) {
      const {createMetadataProviderJobContext}=await import("@/lib/media/metadata-provider-fetch");
      const result=await (await createMetadataProviderJobContext(0)).fetchTitleMetadata({provider:comic ? "comic-vine" : tmdb ? "tmdb" : mutation.sourceProvider as import("./types").BookProviderCode,externalId:mutation.sourceExternalId,mediaType:comic ? "comic" : tmdb ? mediaType as "film" | "series" : "book"});
      if (result.error || !result.metadata?.snapshotReferences) return {type:"reject"};
      refs=result.metadata.snapshotReferences;
    }
    if (comic) {
      const bundle = await prepareComicVineSnapshotReferences(mutation.sourceExternalId, refs);
      return {...mutation,facts:bundle.projection.facts,snapshotReferences:refs,providerSnapshot:{...mutation.providerSnapshot,facts:bundle.projection.facts}};
    }
    if (tmdb) {
      const bundle = await (series ? prepareTmdbSeriesSnapshotReferences : prepareTmdbFilmSnapshotReferences)(mutation.sourceExternalId,refs);
      return {...mutation,facts:bundle.projection.facts,snapshotReferences:refs,providerSnapshot:{...mutation.providerSnapshot,facts:bundle.projection.facts}};
    }
    await prepareBookSnapshotReferences(mutation.sourceProvider,mutation.sourceExternalId,refs);
    return {...mutation,snapshotReferences:refs};
  } catch {return {type:"reject"};}
}

export function isBookSnapshotValidationError(error:unknown) {
  return error instanceof Error && ["PROVIDER_SNAPSHOT_CHANGED","INVALID_PROVIDER_SNAPSHOT_REFERENCES","INCOMPLETE_PROVIDER_SNAPSHOTS","INVALID_PROVIDER_SNAPSHOT_TARGET","PROVIDER_SNAPSHOT_MISSING"].includes(error.message);
}
