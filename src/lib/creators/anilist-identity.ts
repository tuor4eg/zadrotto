/** Staff and studios have independent numeric ID namespaces in AniList. */
export function isAniListCreatorId(value: unknown): value is string {
  return typeof value === "string" && /^(person|studio):[1-9]\d*$/.test(value)
    && Number.isSafeInteger(Number(value.split(":")[1]));
}
export function isAniListPersonId(value: unknown): value is string {
  return isAniListCreatorId(value) && value.startsWith("person:");
}
