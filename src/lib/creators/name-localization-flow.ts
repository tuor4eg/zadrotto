import { isCreatorNameLocalizationResponse, type CreatorNameLocalizationResponse } from "./name-localization";

/** The persistence callback is never reached for API errors or an invalid batch. */
export async function runCreatorNameLocalizationFlow(input: {
  ids: number[];
  generate: () => Promise<unknown>;
  save: (response: CreatorNameLocalizationResponse) => Promise<void>;
  signal?: AbortSignal;
}) {
  input.signal?.throwIfAborted();
  const response = await input.generate();
  if (!isCreatorNameLocalizationResponse(response, input.ids)) throw new Error("INVALID_CREATOR_NAME_LOCALIZATION_RESPONSE");
  input.signal?.throwIfAborted();
  await input.save(response);
}
