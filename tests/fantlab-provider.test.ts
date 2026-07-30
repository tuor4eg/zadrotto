import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCoverProviderDefaultSettings } from "@/lib/covers/provider-settings";
import { fantLabProvider } from "@/lib/covers/providers/fantlab";
import type { CoverSearchOptions } from "@/lib/covers/types";
import { getMediaMetadataRefreshSource } from "@/lib/media/metadata-refresh-source";

const options = {
  candidateLimit: 2,
  tmdbResultScanLimit: 1,
} satisfies CoverSearchOptions;

describe("FantLab provider", () => {
  it("maps book title and cover candidates, normalizes values, and respects the candidate limit", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: URL[] = [];

    globalThis.fetch = async (input) => {
      requestedUrls.push(new URL(String(input)));

      return Response.json({
        works: [
          {
            id: "42",
            name: " Дюна ",
            name_orig: " Dune ",
            year: "1965",
            description: " Роман о пустынной планете. ",
            image: "/images/work42.jpg",
            creators: {
              authors: [{ name: " Фрэнк Герберт " }],
            },
          },
          {
            work_id: 43,
            work_name: "Мессия Дюны",
            work_name_orig: "Dune Messiah",
            work_year: 1969,
            image: "//fantlab.ru/images/work43.jpg",
          },
          {
            id: 44,
            name: "Дети Дюны",
            year: 1976,
            image: "https://fantlab.ru/images/work44.jpg",
          },
        ],
      });
    };

    try {
      const titleCandidates = await fantLabProvider.searchTitleCandidates?.(
        { mediaType: "book", query: "  Дюна  " },
        options,
      );
      const coverCandidates = await fantLabProvider.searchCoverCandidates?.(
        { mediaType: "book", title: "  Дюна  " },
        options,
      );

      assert.deepEqual(titleCandidates, [
        {
          id: "work:42",
          provider: "fantlab",
          externalId: "42",
          mediaType: "book",
          title: "Дюна",
          originalTitle: "Dune",
          description: "Роман о пустынной планете.",
          coverUrl: "https://fantlab.ru/images/work42.jpg",
          sourcePageUrl: "https://fantlab.ru/work42",
          releaseYear: 1965,
        },
        {
          id: "work:43",
          provider: "fantlab",
          externalId: "43",
          mediaType: "book",
          title: "Мессия Дюны",
          originalTitle: "Dune Messiah",
          description: null,
          coverUrl: "https://fantlab.ru/images/work43.jpg",
          sourcePageUrl: "https://fantlab.ru/work43",
          releaseYear: null,
        },
      ]);
      assert.deepEqual(coverCandidates, [
        {
          id: "work:42",
          provider: "fantlab",
          title: "Дюна",
          imageUrl: "https://fantlab.ru/images/work42.jpg",
          sourcePageUrl: "https://fantlab.ru/work42",
          year: 1965,
        },
        {
          id: "work:43",
          provider: "fantlab",
          title: "Мессия Дюны",
          imageUrl: "https://fantlab.ru/images/work43.jpg",
          sourcePageUrl: "https://fantlab.ru/work43",
          year: 1969,
        },
      ]);
      assert.equal(requestedUrls.length, 2);
      for (const url of requestedUrls) {
        assert.equal(url.origin, "https://api.fantlab.ru");
        assert.equal(url.pathname, "/search-txt");
        assert.equal(url.searchParams.get("q"), "Дюна");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("loads metadata and the selected cover from the exact /search-ids work", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: URL[] = [];

    globalThis.fetch = async (input) => {
      requestedUrls.push(new URL(String(input)));

      return Response.json([
        {
          id: 41,
          name: "Не та книга",
          image: "/images/work41.jpg",
        },
        {
          doc: "42",
          name: "Дюна",
          image: "/images/work42.jpg",
          creators: {
            authors: [
              { name: "Фрэнк Герберт" },
              { name: "Фрэнк Герберт" },
              { name: "" },
            ],
          },
          authors: [{ name: "Другой автор" }],
          year: "1965",
        },
      ]);
    };

    try {
      assert.deepEqual(
        await fantLabProvider.getTitleMetadata?.(
          { provider: "fantlab", externalId: "https://fantlab.ru/work42?sort=1", mediaType: "book" },
          options,
        ),
        {
          provider: "fantlab",
          externalId: "42",
          sourceUrl: "https://fantlab.ru/work42",
          facts: {
            authors: ["Фрэнк Герберт", "Другой автор"],
          },
        },
      );
      assert.deepEqual(
        await fantLabProvider.getCoverCandidatesByTitleSource?.(
          {
            mediaType: "book",
            title: "Fallback",
            titleSource: { provider: "fantlab", externalId: "work:42" },
          },
          options,
        ),
        [
          {
            id: "work:42",
            provider: "fantlab",
            title: "Дюна",
            imageUrl: "https://fantlab.ru/images/work42.jpg",
            sourcePageUrl: "https://fantlab.ru/work42",
            year: 1965,
          },
        ],
      );
      assert.equal(requestedUrls.length, 2);
      for (const url of requestedUrls) {
        assert.equal(url.pathname, "/search-ids");
        assert.equal(url.searchParams.get("w"), "42");
        assert.deepEqual([...url.searchParams.keys()], ["w"]);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to covers from related editions when the selected work has no image", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: URL[] = [];

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      requestedUrls.push(url);

      if (url.pathname === "/search-ids" && url.searchParams.has("w")) {
        return Response.json({
          works: [{ id: 1693, name: "Властелин Колец", image: null }],
        });
      }

      if (url.pathname === "/work/1693/extended") {
        return Response.json({
          editions_blocks: {
            10: {
              list: [
                { edition_id: 1047, pic_num: 1 },
                { edition_id: 4013, pic_num: "2" },
                { edition_id: 9999, pic_num: 0 },
              ],
            },
          },
        });
      }

      return Response.json({
        editions: [
          { id: 1047, name: "Властелин колец", image: "/images/editions/big/1047", year: 1991 },
          { id: "4013", name: "Братство Кольца", image: "/images/editions/big/4013", year: "1992" },
        ],
      });
    };

    try {
      assert.deepEqual(
        await fantLabProvider.getCoverCandidatesByTitleSource?.(
          {
            mediaType: "book",
            title: "Властелин Колец",
            titleSource: { provider: "fantlab", externalId: "1693" },
          },
          options,
        ),
        [
          {
            id: "edition:1047",
            provider: "fantlab",
            title: "Властелин колец",
            imageUrl: "https://fantlab.ru/images/editions/big/1047",
            sourcePageUrl: "https://fantlab.ru/edition1047",
            year: 1991,
          },
          {
            id: "edition:4013",
            provider: "fantlab",
            title: "Братство Кольца",
            imageUrl: "https://fantlab.ru/images/editions/big/4013",
            sourcePageUrl: "https://fantlab.ru/edition4013",
            year: 1992,
          },
        ],
      );
      assert.deepEqual(
        requestedUrls.map((url) => `${url.pathname}${url.search}`),
        [
          "/search-ids?w=1693",
          "/work/1693/extended",
          "/search-ids?e=1047%2C4013",
        ],
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects invalid sources and skips records without usable IDs or covers", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;

    globalThis.fetch = async () => {
      fetchCalls += 1;

      return Response.json({
        works: [
          { id: "not-an-id", name: "Broken", image: "/broken.jpg" },
          { id: 2, name: "No cover" },
          { id: 3, name: "Bad cover", image: "http://[" },
          { id: 4, name: "Valid", image: "/valid.jpg", year: "unknown" },
        ],
      });
    };

    try {
      assert.deepEqual(
        await fantLabProvider.searchCoverCandidates?.(
          { mediaType: "book", title: "Book" },
          options,
        ),
        [
          {
            id: "work:4",
            provider: "fantlab",
            title: "Valid",
          imageUrl: "https://fantlab.ru/valid.jpg",
            sourcePageUrl: "https://fantlab.ru/work4",
            year: undefined,
          },
        ],
      );
      assert.equal(
        await fantLabProvider.getTitleMetadata?.(
          { provider: "fantlab", externalId: "work:nope", mediaType: "book" },
          options,
        ),
        null,
      );
      assert.deepEqual(
        await fantLabProvider.searchTitleCandidates?.(
          { mediaType: "book", query: "   " },
          options,
        ),
        [],
      );
      assert.equal(fetchCalls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("registers FantLab after the existing book providers and normalizes refresh sources", () => {
    assert.deepEqual(
      getCoverProviderDefaultSettings().filter((setting) => setting.mediaType === "book"),
      [
        { mediaType: "book", providerCode: "open-library", enabled: true, titleSearchMode: "parallel", coverSearchEnabled: true, priority: 10 },
        { mediaType: "book", providerCode: "google-books", enabled: true, titleSearchMode: "parallel", coverSearchEnabled: true, priority: 20 },
        { mediaType: "book", providerCode: "fantlab", enabled: true, titleSearchMode: "parallel", coverSearchEnabled: true, priority: 30 },
      ],
    );
    assert.deepEqual(
      getMediaMetadataRefreshSource({
        mediaType: "book",
        titleSource: {
          provider: "fantlab",
          externalId: "https://fantlab.ru/work42/",
        },
        metadata: null,
      }),
      { provider: "fantlab", externalId: "42", mediaType: "book" },
    );
    assert.deepEqual(
      getMediaMetadataRefreshSource({
        mediaType: "book",
        titleSource: null,
        metadata: {
          sourceProvider: "fantlab",
          sourceExternalId: "work:43",
        },
      }),
      { provider: "fantlab", externalId: "43", mediaType: "book" },
    );
  });
});
