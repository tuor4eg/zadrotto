import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const mediaItemsQuerySource = readFileSync("src/db/queries/media-items.ts", "utf8");
const adminMediaPageSource = readFileSync("src/app/admin/(protected)/media/page.tsx", "utf8");

function getDeleteAdminUnpublishedMediaItemSource() {
  const start = mediaItemsQuerySource.indexOf(
    "export async function deleteAdminUnpublishedMediaItemWithRelatedData",
  );
  const end = mediaItemsQuerySource.indexOf("export async function canViewMediaItemCover");

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  return mediaItemsQuerySource.slice(start, end);
}

describe("deleteAdminUnpublishedMediaItemWithRelatedData", () => {
  const source = getDeleteAdminUnpublishedMediaItemSource();

  it("allows deleting only unpublished media items", () => {
    assert.match(source, /ne\(mediaItems\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/);
  });

  it("removes related reviews, experiences, and ratings before deleting the item", () => {
    const contributionMediaItemsDeleteIndex = source.indexOf(".delete(contributionMediaItems)");
    const contributionsDeleteIndex = source.indexOf(".delete(contributions)");
    const experienceDeleteIndex = source.indexOf(".delete(authorMediaExperiences)");
    const ratingDeleteIndex = source.indexOf(".delete(ratings)");
    const itemDeleteIndex = source.indexOf(".delete(mediaItems)");

    assert.ok(contributionMediaItemsDeleteIndex > -1);
    assert.ok(contributionsDeleteIndex > -1);
    assert.ok(experienceDeleteIndex > -1);
    assert.ok(ratingDeleteIndex > -1);
    assert.ok(itemDeleteIndex > -1);
    assert.ok(contributionMediaItemsDeleteIndex < itemDeleteIndex);
    assert.ok(contributionsDeleteIndex < itemDeleteIndex);
    assert.ok(experienceDeleteIndex < itemDeleteIndex);
    assert.ok(ratingDeleteIndex < itemDeleteIndex);
  });
});

describe("AdminMediaItemActions", () => {
  it("shows a confirmation dialog for unpublished item deletion", () => {
    assert.match(adminMediaPageSource, /item\.publicationStatus !== "published"/);
    assert.match(adminMediaPageSource, /<ConfirmAction/);
    assert.match(adminMediaPageSource, /оценками, рецензиями и пользовательскими отметками/);
  });
});
