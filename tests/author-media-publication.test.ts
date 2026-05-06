import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canAuthorRequestPublication,
  getPublicationStatusAfterAuthorSubmit,
} from "../src/lib/author-media-publication";

describe("author media publication", () => {
  it("sends regular author submissions to review", () => {
    assert.equal(getPublicationStatusAfterAuthorSubmit([]), "submitted");
  });

  it("publishes immediately when author has permission", () => {
    assert.equal(
      getPublicationStatusAfterAuthorSubmit(["publish_media_without_review"]),
      "published",
    );
  });

  it("allows publication request from private or rejected status", () => {
    assert.equal(canAuthorRequestPublication("private"), true);
    assert.equal(canAuthorRequestPublication("rejected"), true);
    assert.equal(canAuthorRequestPublication("submitted"), false);
    assert.equal(canAuthorRequestPublication("published"), false);
  });
});
