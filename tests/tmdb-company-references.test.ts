import assert from "node:assert/strict";
import { test } from "node:test";
import { extractTmdbCompanyReferences } from "../src/lib/creators/tmdb-companies";

const snapshot = (production_companies: unknown) => ({ providerCode: "tmdb", externalId: "42", payload: { id: 42, production_companies } });

test("TMDB companies preserve external identity, order and logo evidence without importing credits", () => {
  const input = snapshot([
    { id: 12, name: " Same Studio ", logo_path: "/logo.png" },
    { id: 13, name: "Same Studio", logo_path: null },
    { id: 12, name: "Same Studio", logo_path: "/logo.png" },
  ]);
  const result = extractTmdbCompanyReferences(input);
  assert.deepEqual(result.map(({ externalId, name, roleCode, sourcePosition, logoPath }) => ({ externalId, name, roleCode, sourcePosition, logoPath })), [
    { externalId: "company:12", name: "Same Studio", roleCode: "production_company", sourcePosition: 0, logoPath: "/logo.png" },
    { externalId: "company:13", name: "Same Studio", roleCode: "production_company", sourcePosition: 1, logoPath: null },
  ]);
  assert.equal(result[0].sourceUrl, "https://www.themoviedb.org/company/12");
  assert.deepEqual(extractTmdbCompanyReferences(snapshot([])), []);
});

test("TMDB missing and malformed company evidence never becomes an empty roster", () => {
  for (const companies of [undefined, null, {}, "Studio", [{ name: "Missing ID" }], [{ id: 0, name: "Zero" }], [{ id: 1, name: " " }], [{ id: 1.5, name: "Fraction" }]]) {
    assert.throws(() => extractTmdbCompanyReferences(snapshot(companies)), JSON.stringify(companies));
  }
  assert.throws(() => extractTmdbCompanyReferences({ ...snapshot([]), providerCode: "igdb" }));
});

test("TMDB conflicting duplicate identities and mismatched movie snapshots require review", () => {
  assert.throws(() => extractTmdbCompanyReferences(snapshot([{ id: 1, name: "One" }, { id: 1, name: "Other" }])));
  assert.throws(() => extractTmdbCompanyReferences(snapshot([{ id: 1, name: "One", logo_path: "https://evil.example/logo.png" }])));
  assert.throws(() => extractTmdbCompanyReferences({ ...snapshot([]), externalId: "43" }));
});

test("organization approval IDs include network and company namespaces without conflating them", async () => {
  const { isTmdbOrganizationId, isTmdbCompanyId } = await import("../src/lib/creators/tmdb-companies");
  for (const id of ["company:42", "network:42"]) assert.equal(isTmdbOrganizationId(id), true);
  for (const id of ["person:42", "network:x", "network:0", "network:-1", "network:9007199254740992"]) assert.equal(isTmdbOrganizationId(id), false);
  assert.equal(isTmdbCompanyId("network:42"), false);
});
