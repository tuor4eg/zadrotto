import assert from "node:assert/strict";
import { test } from "node:test";
import { animeCompanySearchDescriptor, exactAnimeCompanyCandidates, fetchAnimeCompanySearch } from "../src/lib/creators/anime-company-logo-search";

const candidate = (id: number, name: string) => ({ id, name, logo_path: null, origin_country: "JP" });
test("TMDB company search proves unique exact names over all pages and retains full raw responses", async () => {
  let requests = 0; let budgets = 0;
  const result = await fetchAnimeCompanySearch("Studio", { token: "test", signal: new AbortController().signal,
    beforeRequest: async () => { budgets++; }, fetchImpl: async input => {
      requests++; assert.equal(new URL(String(input)).searchParams.get("page"), String(requests));
      return Response.json({ page: requests, total_pages: 2, total_results: 2, results: [candidate(requests, requests === 1 ? "Studio" : "STUDIO")], extra: "raw" });
    } });
  assert.equal(requests, 2); assert.equal(budgets, 2);
  assert.equal(exactAnimeCompanyCandidates(result).length, 2, "an exact match on page one cannot prove uniqueness");
  assert.equal(result.responses.length, 2);
  assert.equal((result.responses[0] as { extra: string }).extra, "raw");
  assert.equal(exactAnimeCompanyCandidates({ complete: true, query: "Studio", results: [candidate(1, "Studio Extended")] }).length, 0);
  assert.notDeepEqual(animeCompanySearchDescriptor("1", "Studio"), animeCompanySearchDescriptor("1", "New Studio"));
});
test("empty search is complete; partial pages, malformed and HTTP errors never become empty evidence", async () => {
  const options = { token: "test", signal: new AbortController().signal, beforeRequest: async () => {} };
  assert.deepEqual((await fetchAnimeCompanySearch("Missing", { ...options, fetchImpl: async () => Response.json({ page: 1, total_pages: 0, total_results: 0, results: [] }) })).results, []);
  for (const response of [Response.json({ page: 1, total_pages: 2, total_results: 2, results: [] }), Response.json({ page: 1, total_pages: 1, total_results: 2, results: [candidate(1, "Studio")] }), new Response("", { status: 429 })]) {
    await assert.rejects(fetchAnimeCompanySearch("Studio", { ...options, fetchImpl: async () => response }));
  }
});
