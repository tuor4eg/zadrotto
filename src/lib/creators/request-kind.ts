/** Shared request presentation; provider IDs keep their independent namespaces. */
export function isOrganizationCreatorRequest(provider?: string, externalId?: string | null) {
  return (provider === "roblox" && /^group:/.test(externalId ?? "")) || (provider === "comic-vine" && /^publisher:/.test(externalId ?? "")) || provider === "igdb" || provider === "rawg"
    || (provider === "tmdb" && /^(company|network):/.test(externalId ?? ""))
    || (provider === "anilist" && /^studio:/.test(externalId ?? ""));
}
