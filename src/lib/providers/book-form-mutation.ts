import "server-only";
import type { MediaMetadataFormMutation } from "@/lib/media/metadata-form-mutation";
import { isBookSnapshotProvider, prepareBookSnapshotReferences } from "./book-service";

/** Old signed selections are accepted only after obtaining full server-side evidence. */
export async function validateBookFormMutation(mutation:MediaMetadataFormMutation,mediaType:string):Promise<MediaMetadataFormMutation> {
  if (mutation.type!=="upsert" || mediaType!=="book" || !isBookSnapshotProvider(mutation.sourceProvider)) return mutation;
  try {
    let refs=mutation.snapshotReferences;
    if (!refs) {
      const {createMetadataProviderJobContext}=await import("@/lib/media/metadata-provider-fetch");
      const result=await (await createMetadataProviderJobContext(0)).fetchTitleMetadata({provider:mutation.sourceProvider,externalId:mutation.sourceExternalId,mediaType:"book"});
      if (result.error || !result.metadata?.snapshotReferences) return {type:"reject"};
      refs=result.metadata.snapshotReferences;
    }
    await prepareBookSnapshotReferences(mutation.sourceProvider,mutation.sourceExternalId,refs);
    return {...mutation,snapshotReferences:refs};
  } catch {return {type:"reject"};}
}

export function isBookSnapshotValidationError(error:unknown) {
  return error instanceof Error && ["PROVIDER_SNAPSHOT_CHANGED","INVALID_PROVIDER_SNAPSHOT_REFERENCES","INCOMPLETE_PROVIDER_SNAPSHOTS"].includes(error.message);
}
