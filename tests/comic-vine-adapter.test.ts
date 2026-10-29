import { strict as assert } from "node:assert";
import { test } from "node:test";
import { normalizeComicVineIssue, normalizeComicVineVolume } from "../src/lib/providers/comic-vine-adapter";

const volume = { providerCode: "comic-vine", externalId: "12", payload: { id: 12, publisher: { id: 5, name: "Publisher" }, first_issue: { id: 42 }, count_of_issues: 10, start_year: "1999", site_detail_url: "https://example.com" } };
const issue = { providerCode: "comic-vine", externalId: "42", payload: { id: 42, volume: { id: 12 }, person_credits: [
  { id: 7, name: "Creator", role: "writer, penciler, inker" },
  { id: 7, name: "Creator", role: "cover, colorist" },
  { id: 8, name: "Other", role: "editor" },
] } };

test("volume and first issue map metadata and combine artwork without combining roles", () => {
  const result = normalizeComicVineVolume(volume);
  assert.deepEqual(result.facts, { publisher: "Publisher", issueCount: 10, startYear: 1999 });
  assert.equal(result.firstIssueId, "42");
  assert.deepEqual(result.creators.map(c => c.externalId), ["publisher:5"]);
  const refs = normalizeComicVineIssue(issue, "12");
  assert.deepEqual(refs.map(c => c.roleCode), ["screenwriter", "artist"]);
  assert.deepEqual(refs[1].work, ["penciler", "inker", "colorist", "cover"]);
});

test("rejects wrong volume, incomplete credits and contradictory names", () => {
  assert.throws(() => normalizeComicVineIssue(issue, "13"), /INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
  assert.throws(() => normalizeComicVineIssue({ ...issue, payload: { ...issue.payload, person_credits: null } }, "12"), /INCOMPLETE_PROVIDER_SNAPSHOTS/);
  assert.throws(() => normalizeComicVineIssue({ ...issue, payload: { ...issue.payload, person_credits: [{ id: 7, name: "A", role: "cover" }, { id: 7, name: "B", role: "inker" }] } }, "12"), /INCOMPLETE_PROVIDER_SNAPSHOTS/);
  assert.deepEqual(normalizeComicVineIssue({ ...issue, payload: { ...issue.payload, person_credits: [] } }, "12"), []);
});

test("Comic Vine creator identities use the shared profile registry", async () => {
  const { creatorProfileTargetFromBinding, creatorProfileDescriptor } = await import("../src/lib/providers/creator-profile-targets");
  const { validateCreatorProfilePayload } = await import("../src/lib/providers/creator-profile-fetch");
  const { parseSnapshotJobPayload } = await import("../src/lib/providers/snapshot-job-payload");
  const target = creatorProfileTargetFromBinding({ provider: "comic-vine", externalCreatorId: "person:7" });
  assert.deepEqual(target, { provider: "comic-vine", resourceType: "person", externalId: "7" });
  assert.equal(creatorProfileDescriptor(target!).apiMethod, "person.details");
  validateCreatorProfilePayload(target!, { status_code: 1, results: { id: 7, name: "Creator" } });
  assert.throws(() => validateCreatorProfilePayload(target!, { status_code: 1, results: { id: 8, name: "Creator" } }), /INVALID_CREATOR_PROFILE_RESPONSE/);
  assert.equal(parseSnapshotJobPayload({ mediaType: "comic", provider: "comic-vine", operation: "process" }).mediaType, "comic");
});
