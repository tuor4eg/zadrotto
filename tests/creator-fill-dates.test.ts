import assert from "node:assert/strict";
import test from "node:test";
import { projectCreatorFillDates, supportsCreatorFillDates } from "../src/lib/providers/creator-fill-dates";
import { fetchCreatorProfileRaw } from "../src/lib/providers/creator-profile-fetch";
import { creatorFillDatesDescriptor, creatorProfileDescriptor, type CreatorProfileTarget } from "../src/lib/providers/creator-profile-targets";
import type { JSONValue } from "../src/lib/providers/types";

const aniList = { provider: "anilist", resourceType: "person", externalId: "17" } as const;
const aniListProfile = {
  id: 17,
  name: { full: "Example" },
  dateOfBirth: { year: 1940, month: 2, day: 29 },
  dateOfDeath: { year: 2000, month: null, day: null },
};

function project(target: CreatorProfileTarget, payload: JSONValue) {
  return projectCreatorFillDates(target, { ...creatorFillDatesDescriptor(target), payload });
}

test("AniList projects complete fuzzy dates and rejects old image descriptors", () => {
  assert.deepEqual(project(aniList, aniListProfile), {
    birthDate: "1940-02-29", deathDate: null, diagnostics: ["partial-dateOfDeath"],
  });
  assert.deepEqual(project(aniList, { ...aniListProfile, dateOfBirth: { year: 1941, month: 2, day: 29 }, dateOfDeath: null }), {
    birthDate: null, deathDate: null, diagnostics: ["invalid-dateOfBirth"],
  });
  assert.throws(() => projectCreatorFillDates(aniList, { ...creatorProfileDescriptor(aniList), payload: aniListProfile }), /INVALID_CREATOR_SNAPSHOT/);
});

test("AniList requests both dates in date mode and preserves the raw response", async () => {
  const result = await fetchCreatorProfileRaw(aniList, {
    includeDates: true,
    signal: new AbortController().signal,
    credentials: {},
    requestStartedAt: async () => new Date(1),
    anilistFetch: async (_url, init, options) => {
      await options?.beforeRequest?.();
      const { query, variables } = JSON.parse(String(init?.body));
      assert.match(query, /dateOfBirth \{ year month day \}/);
      assert.match(query, /dateOfDeath \{ year month day \}/);
      assert.deepEqual(variables, { id: 17 });
      return Response.json({ data: { Staff: aniListProfile } });
    },
  });
  assert.deepEqual(result.payload, aniListProfile);
});

test("Comic Vine takes the calendar day without applying the timestamp offset", () => {
  const target = { provider: "comic-vine", resourceType: "person", externalId: "17" } as const;
  const results = { id: 17, name: "Example", birth: "1900-12-31 22:30:00-05:00", death: { date: "1995-02-28 00:00:00.000000" } };
  assert.deepEqual(project(target, { status_code: 1, results }), {
    birthDate: "1900-12-31", deathDate: "1995-02-28", diagnostics: [],
  });
  assert.deepEqual(project(target, { status_code: 1, results: { ...results, birth: "1901-01-01", death: { date: "1995-02-29" } } }), {
    birthDate: null, deathDate: null, diagnostics: ["ambiguous-birth", "invalid-death"], reviewDates: { birthDate: "1901-01-01" },
  });
  assert.throws(() => project(target, { status_code: 1, results: { ...results, id: 18 } }), /INVALID_CREATOR_SNAPSHOT/);
});

test("IGDB needs full precision and projects founding only", () => {
  const target = { provider: "igdb", resourceType: "company", externalId: "17" } as const;
  const payload = { id: 17, name: "Example", start_date: Date.UTC(1982, 0, 1) / 1000, change_date: Date.UTC(2001, 0, 1) / 1000 };
  const expected = { birthDate: "1982-01-01", deathDate: null, diagnostics: [] };
  assert.deepEqual(project(target, { ...payload, start_date_format: { format: "YYYYMMDD" } }), expected);
  assert.deepEqual(projectCreatorFillDates(target, {
    ...creatorProfileDescriptor(target), payload: { ...payload, start_date_category: 0 },
  }), expected);
  assert.deepEqual(projectCreatorFillDates(target, {
    ...creatorProfileDescriptor(target), payload: { ...payload, start_date_format: 0 },
  }), expected);
  for (const precision of [{ start_date_category: 2 }, { start_date_format: 1 }, {
    start_date_category: 0, start_date_format: { format: "YYYY" },
  }]) {
    assert.deepEqual(project(target, { ...payload, ...precision } as JSONValue), {
      birthDate: null, deathDate: null, diagnostics: ["partial-start_date"],
    });
  }
  assert.deepEqual(project(target, { ...payload, start_date_format: 9 }), {
    birthDate: null, deathDate: null, diagnostics: ["unverified-start_date-precision"],
  });
  assert.equal(supportsCreatorFillDates({ ...target, provider: "tmdb" }), false);
});
