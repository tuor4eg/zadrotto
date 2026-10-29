import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateComicVineIssues, comicVineIssueIds } from "../src/lib/providers/comic-vine-issue-aggregation";

const volume = { providerCode: "comic-vine", externalId: "1", payload: { id: 1, count_of_issues: 2, first_issue: { id: 10 }, issues: [{ id: 10 }, { id: 11 }] } };
const issue = (id: number, role: string) => ({ providerCode: "comic-vine", externalId: String(id), payload: { id, volume: { id: 1 }, person_credits: [{ id: 2, name: "Creator", role }] } });

test("aggregates distinct issues independently per role and combines artistic work", () => {
  assert.deepEqual(comicVineIssueIds(volume), ["10", "11"]);
  const rows = aggregateComicVineIssues("1", [issue(10, "writer, penciler"), issue(11, "writer, inker"), issue(10, "writer, penciler")]);
  assert.deepEqual(rows.map(row => [row.roleCode, row.issueCount]), [["screenwriter", 2], ["artist", 2]]);
  assert.deepEqual(rows[1].work, ["penciler", "inker"]);
});

test("incomplete lists and foreign issue evidence cannot become a complete roster", () => {
  assert.throws(() => comicVineIssueIds({ ...volume, payload: { ...volume.payload, count_of_issues: 3 } }), /INCOMPLETE_COMIC_VINE_ISSUE_LIST/);
  assert.throws(() => comicVineIssueIds({ ...volume, payload: { ...volume.payload, issues: [{ id: 10 }, { id: 10 }] } }), /INCOMPLETE_COMIC_VINE_ISSUE_LIST/);
  assert.throws(() => aggregateComicVineIssues("2", [issue(10, "writer")]), /INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
});
