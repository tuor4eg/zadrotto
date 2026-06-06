import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createCoverCandidateToken,
  normalizeCoverCandidates,
  verifyCoverCandidateToken,
} from "@/lib/covers/candidates";
import { getCoverProvidersForMediaType, searchCoverCandidates } from "@/lib/covers/registry";
import { isS3ObjectKey, resolveCoverUpload, uploadManualCover } from "@/lib/covers/storage";
import type { CoverCandidate, CoverProvider } from "@/lib/covers/types";

const baseCandidate = {
  id: "external:1",
  provider: "open-library",
  title: "Dune",
  imageUrl: "https://example.com/dune.jpg",
  sourcePageUrl: "https://example.com/dune",
} as const satisfies CoverCandidate;

describe("cover candidates", () => {
  it("normalizes candidates and removes broken or duplicate image URLs", () => {
    assert.deepEqual(
      normalizeCoverCandidates([
        baseCandidate,
        { ...baseCandidate, id: "external:2" },
        { ...baseCandidate, id: "", imageUrl: "https://example.com/empty.jpg" },
        { ...baseCandidate, id: "external:3", imageUrl: "/relative.jpg" },
        { ...baseCandidate, id: "external:4", imageUrl: "https://example.com/other.jpg" },
      ]),
      [baseCandidate, { ...baseCandidate, id: "external:4", imageUrl: "https://example.com/other.jpg" }],
    );
  });

  it("signs and verifies cover candidate tokens", () => {
    process.env.COVER_CANDIDATE_SECRET = "test-secret";

    const token = createCoverCandidateToken(baseCandidate);

    assert.deepEqual(verifyCoverCandidateToken(token), baseCandidate);
    assert.equal(verifyCoverCandidateToken(`${token}x`), null);
  });
});

describe("cover provider registry", () => {
  const providers = [
    {
      code: "open-library",
      mediaTypes: ["book"],
      async searchCoverCandidates() {
        return [baseCandidate];
      },
    },
    {
      code: "google-books",
      mediaTypes: ["book"],
      async searchCoverCandidates() {
        throw new Error("provider is down");
      },
    },
    {
      code: "rawg",
      mediaTypes: ["game"],
      async searchCoverCandidates() {
        return [{ ...baseCandidate, provider: "rawg", id: "game:1" }];
      },
    },
  ] satisfies CoverProvider[];

  it("selects providers by media type", () => {
    assert.deepEqual(
      getCoverProvidersForMediaType("book", providers).map((provider) => provider.code),
      ["open-library", "google-books"],
    );
    assert.deepEqual(
      getCoverProvidersForMediaType("comic", providers).map((provider) => provider.code),
      [],
    );
  });

  it("returns successful provider results when another provider fails", async () => {
    assert.deepEqual(
      await searchCoverCandidates(
        {
          title: "Dune",
          originalTitle: null,
          mediaType: "book",
          releaseYear: null,
        },
        providers,
      ),
      [baseCandidate],
    );
  });

  it("does not search without a title", async () => {
    assert.deepEqual(
      await searchCoverCandidates(
        {
          title: " ",
          originalTitle: null,
          mediaType: "book",
          releaseYear: null,
        },
        providers,
      ),
      [],
    );
  });
});

describe("cover storage helper", () => {
  it("detects local S3 object keys", () => {
    assert.equal(isS3ObjectKey("covers/media-items/test.jpg"), true);
    assert.equal(isS3ObjectKey("https://example.com/test.jpg"), false);
    assert.equal(isS3ObjectKey(null), false);
  });

  it("returns an empty manual source when no cover was selected", async () => {
    assert.deepEqual(
      await resolveCoverUpload({
        mediaItemCode: "dune",
        coverFile: null,
        candidateToken: null,
      }),
      {
        ok: true,
        coverUrl: null,
        source: {
          provider: null,
          externalId: null,
          pageUrl: null,
        },
      },
    );
  });

  it("validates manual cover file input before uploading", async () => {
    const result = await uploadManualCover({
      mediaItemCode: "dune",
      coverFile: new File(["not an image"], "cover.gif", { type: "image/gif" }),
    });

    assert.deepEqual(result, { ok: false, error: "cover-type" });
  });
});
