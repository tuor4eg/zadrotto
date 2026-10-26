import assert from "node:assert/strict";
import test from "node:test";
import { isAniListCreatorId, isAniListPersonId } from "../src/lib/creators/anilist-identity";
import { isOrganizationCreatorRequest } from "../src/lib/creators/request-kind";

test("AniList identities preserve independent staff and studio namespaces", () => {
  assert.equal(isAniListCreatorId("person:42"), true);
  assert.equal(isAniListCreatorId("studio:42"), true);
  assert.equal(isAniListPersonId("person:42"), true);
  assert.equal(isAniListPersonId("studio:42"), false);
  assert.equal(isOrganizationCreatorRequest("anilist", "studio:42"), true);
  assert.equal(isOrganizationCreatorRequest("anilist", "person:42"), false);
  assert.equal(isOrganizationCreatorRequest("tmdb", "company:42"), true);
  assert.equal(isOrganizationCreatorRequest("tmdb", "person:42"), false);
});

test("AniList rejects unqualified, unsupported and unsafe identities", () => {
  for (const value of ["42", "company:42", "person:0", "studio:-1", "person:01", "person:9007199254740992", null, 42]) {
    assert.equal(isAniListCreatorId(value), false, String(value));
  }
});
