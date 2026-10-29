import { normalizeComicVineIssue, type ComicVineArtistWork, type ComicVineCreatorReference } from "./comic-vine-adapter";
import type { RawSnapshot } from "./types";

export type ComicVineAggregatedCreator = ComicVineCreatorReference & { issueCount: number };
type Evidence = Pick<RawSnapshot, "providerCode" | "externalId" | "payload">;

/** A complete issue list is needed before an absent creator can be removed. */
export function comicVineIssueIds(snapshot: Evidence): string[] {
  const envelope = snapshot.payload;
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new Error("INCOMPLETE_COMIC_VINE_ISSUE_LIST");
  const volume = envelope.results && typeof envelope.results === "object" && !Array.isArray(envelope.results) ? envelope.results : envelope;
  if (snapshot.providerCode !== "comic-vine" || Number(volume.id) !== Number(snapshot.externalId) || !Array.isArray(volume.issues)) throw new Error("INCOMPLETE_COMIC_VINE_ISSUE_LIST");
  const ids: string[] = [];
  for (const issue of volume.issues) {
    if (!issue || typeof issue !== "object" || Array.isArray(issue) || typeof issue.id !== "number" || !Number.isSafeInteger(issue.id) || issue.id < 1) throw new Error("INCOMPLETE_COMIC_VINE_ISSUE_LIST");
    const id = String(issue.id);
    if (!ids.includes(id)) ids.push(id);
  }
  if (typeof volume.count_of_issues !== "number" || !Number.isSafeInteger(volume.count_of_issues) || volume.count_of_issues < 0 || ids.length !== volume.count_of_issues) throw new Error("INCOMPLETE_COMIC_VINE_ISSUE_LIST");
  if (volume.first_issue && typeof volume.first_issue === "object" && !Array.isArray(volume.first_issue) && !ids.includes(String(volume.first_issue.id))) throw new Error("INCOMPLETE_COMIC_VINE_ISSUE_LIST");
  return ids;
}

/** Counts distinct issues per role; array order follows the volume issue order. */
export function aggregateComicVineIssues(volumeId: string, issues: readonly Evidence[]): ComicVineAggregatedCreator[] {
  const seenIssues = new Set<string>();
  const rows = new Map<string, ComicVineAggregatedCreator>();
  for (const issue of issues) {
    if (seenIssues.has(issue.externalId)) continue;
    seenIssues.add(issue.externalId);
    for (const ref of normalizeComicVineIssue(issue, volumeId)) {
      const key = `${ref.externalId}:${ref.roleCode}`;
      const existing = rows.get(key);
      if (existing) {
        existing.issueCount++;
        if (ref.work) existing.work = [...new Set([...(existing.work ?? []), ...ref.work])] as ComicVineArtistWork[];
      } else rows.set(key, { ...ref, position: rows.size, issueCount: 1 });
    }
  }
  return [...rows.values()];
}
