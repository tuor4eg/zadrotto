/** Shared request presentation; provider IDs keep their independent namespaces. */
export function isOrganizationCreatorRequest(provider?: string, externalId?: string | null) {
  return provider === "igdb" || provider === "rawg"
    || (provider === "tmdb" && /^(company|network):/.test(externalId ?? ""))
    || (provider === "anilist" && /^studio:/.test(externalId ?? ""));
}
