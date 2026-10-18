import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createFantlabAuthorClient,
  parseFantlabAuthor,
  parseFantlabId,
  parseFantlabSearchPage,
  retryAfterMs,
  selectExactFantlabAuthor,
} from "@/lib/creators/fantlab-api";

const author = { autor_id: 42, type: "autor", is_opened: 1, name: " Фрэнк Герберт ", name_orig: " Frank Herbert " };
const candidate = (id: number) => ({ autor_id: id, rusname: `Автор ${id}`, name: `Author ${id}` });
const page = (ids: number[], total = ids.length) => ({ matches: ids.map(candidate), total_found: total, total });

function harness(responses: (Response | Error)[]) {
  const requests: URL[] = [];
  const cooldowns: number[] = [];
  let acquired = 0;
  const client = createFantlabAuthorClient({
    acquire: async signal => {
      signal.throwIfAborted();
      acquired++;
      return async cooldown => { cooldowns.push(cooldown); };
    },
    fetch: async (input, init) => {
      requests.push(new URL(String(input)));
      assert.equal(init?.redirect, "error");
      const response = responses.shift();
      if (response instanceof Error) throw response;
      assert.ok(response, "Unexpected request");
      return response;
    },
  });
  return { client, requests, cooldowns, acquired: () => acquired };
}

describe("Creator FantLab author API", () => {
  it("parses numeric/string IDs and safe relative images without requiring a photo", () => {
    assert.equal(parseFantlabId("42"), "42");
    assert.equal(parseFantlabId(42), "42");
    for (const invalid of [0, -1, 1.5, "042", "4e2", Number.MAX_SAFE_INTEGER + 1, null]) {
      assert.throws(() => parseFantlabId(invalid));
    }
    assert.deepEqual(parseFantlabAuthor(author, "42"), {
      id: "42", name: "Фрэнк Герберт", originalName: "Frank Herbert", imageUrl: null,
      previewUrl: null, sourceUrl: "https://fantlab.ru/autor42",
    });
    assert.equal(parseFantlabAuthor({ ...author, autor_id: "42", is_opened: "1", image: "/images/42.jpg" }, "42").imageUrl, "https://fantlab.ru/images/42.jpg");
    for (const url of ["https://evil.test/photo.jpg", "http://fantlab.ru/photo.jpg", "https://fantlab.ru.evil.test/a", "https://user:pass@fantlab.ru/a", "https://fantlab.ru:444/a"]) {
      assert.equal(parseFantlabAuthor({ ...author, image: url }, "42").imageUrl, null);
    }
    assert.equal(parseFantlabAuthor({ ...author, image_preview: "//fantlab.ru/preview.jpg" }, "42").previewUrl, "https://fantlab.ru/preview.jpg");
  });

  it("rejects mismatching IDs, closed authors, wrong entity types and absent names", () => {
    for (const invalid of [null, [], { ...author, autor_id: 43 }, { ...author, id: 43 }, { ...author, is_opened: 0 }, { ...author, type: "work" }, { ...author, name: " " }]) {
      assert.throws(() => parseFantlabAuthor(invalid, "42"));
    }
  });

  it("requires complete search metadata and rejects provider warnings", () => {
    for (const invalid of [{ matches: [], total_found: 0 }, { ...page([]), total: "invalid" }, { ...page([]), total_found: null }, { ...page([]), warning: "truncated" }, { ...page([]), error: "failed" }, page([1], 1001), { ...page([1]), total: 0 }]) {
      assert.throws(() => parseFantlabSearchPage(invalid));
    }
    assert.deepEqual(parseFantlabSearchPage(page([])), { total: 0, candidates: [] });
  });

  it("collects every search page before selecting a unique exact normalized name", async () => {
    const h = harness([Response.json(page(Array.from({ length: 25 }, (_, i) => i + 1), 26)), Response.json(page([26], 26))]);
    const result = await h.client.search("Фрэнк Герберт");
    assert.equal(result.length, 26);
    assert.deepEqual(h.requests.map(url => url.searchParams.get("page")), ["1", "2"]);
    assert.ok(h.requests.every(url => url.pathname === "/search-autors" && url.searchParams.get("q") === "Фрэнк Герберт"));
    assert.equal(selectExactFantlabAuthor(["  ФРЭНК   ГЕРБЕРТ "], [{ id: "42", names: ["Фрэнк Герберт"] }]), "42");
    assert.equal(selectExactFantlabAuthor(["Герберт"], [{ id: "42", names: ["Фрэнк Герберт"] }]), null);
    assert.equal(selectExactFantlabAuthor(["Фрэнк Герберт"], [{ id: "42", names: ["Фрэнк Герберт"] }, { id: "43", names: ["Фрэнк Герберт"] }]), null);
  });

  it("rejects duplicate IDs, short pages and totals changing between pages", async () => {
    const first = Array.from({ length: 25 }, (_, i) => i + 1);
    for (const responses of [
      [page([1, 1], 2)],
      [page([1], 26)],
      [page(first, 26), page([26], 27)],
      [page(first, 26), page([1], 26)],
    ]) {
      const h = harness(responses.map(value => Response.json(value)));
      await assert.rejects(h.client.search("Автор"));
    }
  });

  it("retries transient HTTP errors and passes Retry-After to the shared limiter", async () => {
    const h = harness([new Response(null, { status: 429, headers: { "retry-after": "4" } }), new Response(null, { status: 503 }), Response.json(author)]);
    assert.equal((await h.client.author("42")).id, "42");
    assert.equal(h.acquired(), 3);
    assert.deepEqual(h.cooldowns, [4000, 1000, 1000]);
    assert.ok(h.requests.every(url => url.pathname === "/autor/42"));
    assert.equal(retryAfterMs("Sat, 17 Oct 2026 12:00:05 GMT", Date.parse("2026-10-17T12:00:00Z")), 5000);
    assert.equal(retryAfterMs("invalid"), 1000);
  });

  it("bounds retries and does not retry permanent HTTP or malformed JSON failures", async () => {
    for (const responses of [
      [new Response(null, { status: 404 })],
      [new Response("{broken")],
      Array.from({ length: 3 }, () => new Response(null, { status: 500 })),
    ]) {
      const expected = responses.length;
      const h = harness(responses);
      await assert.rejects(h.client.author("42"));
      assert.equal(h.acquired(), expected);
      assert.equal(h.cooldowns.length, expected);
    }
  });

  it("aborts before acquisition and releases an acquired slot when fetch aborts", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const h = harness([]);
    await assert.rejects(h.client.author("42", controller.signal), /cancelled/);
    assert.equal(h.acquired(), 0);
    const active = new AbortController();
    let released = 0;
    const client = createFantlabAuthorClient({
      acquire: async () => async () => { released++; },
      fetch: async () => { active.abort(new Error("cancelled during request")); active.signal.throwIfAborted(); throw new Error("unreachable"); },
    });
    await assert.rejects(client.author("42", active.signal), /cancelled during request/);
    assert.equal(released, 1);
  });
});
