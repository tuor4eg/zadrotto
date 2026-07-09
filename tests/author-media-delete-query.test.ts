import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const mediaItemsQuerySource = readFileSync("src/db/queries/media-items.ts", "utf8");

function getDeleteAuthorDraftMediaItemSource() {
  const start = mediaItemsQuerySource.indexOf("export async function deleteAuthorDraftMediaItem");
  const end = mediaItemsQuerySource.indexOf("export async function getSubmittedAuthorMediaItemsForAdmin");

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  return mediaItemsQuerySource.slice(start, end);
}

describe("deleteAuthorDraftMediaItem", () => {
  const source = getDeleteAuthorDraftMediaItemSource();

  it("deletes only draft-like author media items", () => {
    assert.match(source, /inArray\(mediaItems\.publicationStatus, \["private", "rejected"\]\)/);
  });

  it("removes author-owned rating data before deleting the draft item", () => {
    const experienceDeleteIndex = source.indexOf(".delete(authorMediaExperiences)");
    const ratingDeleteIndex = source.indexOf(".delete(ratings)");
    const itemDeleteIndex = source.indexOf(".delete(mediaItems)");

    assert.ok(experienceDeleteIndex > -1);
    assert.ok(ratingDeleteIndex > -1);
    assert.ok(itemDeleteIndex > -1);
    assert.ok(experienceDeleteIndex < itemDeleteIndex);
    assert.ok(ratingDeleteIndex < itemDeleteIndex);
  });
});
