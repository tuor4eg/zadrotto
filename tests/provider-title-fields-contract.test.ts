import assert from "node:assert/strict";
import { test } from "node:test";
import type { MediaProviderCode, MediaTitleCandidate, MediaTitleMetadata } from "../src/lib/covers/types";
import { getMediaTitleCandidateFormFields, getMediaTitleMetadataFormFields } from "../src/lib/media/title-candidate-form";
import { normalizeBookSnapshots } from "../src/lib/providers/book-adapters";
import type { BookProviderCode, JSONValue } from "../src/lib/providers/types";

type FormFields = ReturnType<typeof getMediaTitleMetadataFormFields>;
type BookFixture = { externalId: string; payload: JSONValue; expected: FormFields };

// Exhaustive by type: a new book provider must declare its raw response and field contract here.
const bookFixtures = {
  fantlab: {
    externalId: "42",
    payload: [{ id: 42, name: "FantLab detail title", name_orig: "FantLab original title", year: "1982",
      description: "FantLab full description", authors: [] }],
    expected: { title: "FantLab detail title", originalTitle: "FantLab original title", releaseYear: "1982", description: "FantLab full description" },
  },
  "google-books": {
    externalId: "volume_42",
    payload: { id: "volume_42", volumeInfo: { title: "Google detail title", subtitle: "Google detail subtitle", publishedDate: "2001-04-12",
      description: "Google full description", authors: [] } },
    expected: { title: "Google detail title", originalTitle: "Google detail subtitle", releaseYear: "2001", description: "Google full description" },
  },
  "open-library": {
    externalId: "/works/OL42W",
    payload: { key: "/works/OL42W", title: "Open Library detail title", first_publish_date: "1997-06-10",
      description: { type: "/type/text", value: "Open Library full description" }, authors: [] },
    expected: { title: "Open Library detail title", originalTitle: "Search original title", releaseYear: "1997", description: "Open Library full description" },
  },
} satisfies Record<BookProviderCode, BookFixture>;

const searchFields: FormFields = { title: "Search title", originalTitle: "Search original title", releaseYear: "1901", description: "Search summary" };

for (const [provider, fixture] of Object.entries(bookFixtures)) {
  test(`${provider}: raw snapshot supplies every supported detail field to the selected form`, () => {
    const projection = normalizeBookSnapshots({ providerCode: provider, externalId: fixture.externalId, payload: fixture.payload });
    const form = getMediaTitleMetadataFormFields(projection.fields, searchFields, false);
    for (const field of ["title", "originalTitle", "releaseYear", "description"] as const) {
      assert.equal(form[field], fixture.expected[field], `${provider}.${field}`);
    }
    assert.deepEqual(getMediaTitleMetadataFormFields(projection.fields, searchFields, true), searchFields,
      "preserveExisting keeps user/search values even when rich detail fields arrive");
  });
}

test("Open Library string descriptions and object descriptions share the form contract without inventing an original title", () => {
  const fixture = bookFixtures["open-library"];
  const projection = normalizeBookSnapshots({ providerCode: "open-library", externalId: fixture.externalId,
    payload: { key: "/works/OL42W", title: "Open Library detail title", first_publish_date: "1997", description: "Open Library full description", authors: [] } });
  assert.ok(!projection.fields.originalTitle, "the work API provides no originalTitle");
  assert.deepEqual(getMediaTitleMetadataFormFields(projection.fields, searchFields, false), fixture.expected);
});

// Exhaustive independently of the production provider list, so adding a provider requires these cases.
const allProviders = {
  bgg: true, tmdb: true, "comic-vine": true, "open-library": true, "google-books": true,
  igdb: true, rawg: true, jikan: true, anilist: true, fantlab: true, roblox: true,
} satisfies Record<MediaProviderCode, true>;

function candidate(provider: MediaProviderCode, overrides: Partial<MediaTitleCandidate> = {}): MediaTitleCandidate {
  return { id: `${provider}:new`, provider, externalId: "new", mediaType: "book", title: "New search title",
    originalTitle: null, releaseYear: null, description: null, coverUrl: null, sourcePageUrl: null, ...overrides };
}

for (const provider of Object.keys(allProviders) as MediaProviderCode[]) {
  test(`${provider}: missing or empty details retain the newly selected candidate without leaking the previous item`, () => {
    const previous: FormFields = { title: "Previous item", originalTitle: "Previous original", releaseYear: "1977", description: "Previous detail" };
    const selected = getMediaTitleCandidateFormFields(candidate(provider), previous, false);
    const expected: FormFields = { title: "New search title", originalTitle: "", releaseYear: "", description: "" };
    assert.deepEqual(selected, expected);
    const emptyDetails: MediaTitleMetadata["fields"][] = [
      undefined, {}, { originalTitle: null, releaseYear: null, description: null },
      { title: "", originalTitle: "", description: "" },
      { title: " \n ", originalTitle: " \t ", description: "\n" },
    ];
    for (const fields of emptyDetails) {
      assert.deepEqual(getMediaTitleMetadataFormFields(fields, selected, false), expected);
      assert.deepEqual(getMediaTitleMetadataFormFields(fields, searchFields, false), searchFields,
        "empty details preserve available values from this candidate's search result");
    }
    const rich = { title: "New detail title", originalTitle: "New original title", releaseYear: 2024, description: "New full description" };
    assert.deepEqual(getMediaTitleMetadataFormFields(rich, selected, false), {
      title: "New detail title", originalTitle: "New original title", releaseYear: "2024", description: "New full description",
    });
    assert.deepEqual(getMediaTitleMetadataFormFields(rich, previous, true), previous);
    assert.deepEqual(getMediaTitleMetadataFormFields(rich, { title: "Manual title", originalTitle: "  ", releaseYear: "", description: "Manual description" }, true), {
      title: "Manual title", originalTitle: "New original title", releaseYear: "2024", description: "Manual description",
    });
  });
}
