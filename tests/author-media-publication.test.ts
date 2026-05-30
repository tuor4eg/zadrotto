import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canAuthorDeleteMediaItem,
  canAuthorRequestPublication,
  canAuthorWithdrawPublicationRequest,
  getPublicationStatusAfterAuthorSubmit,
} from "../src/lib/author-media-publication";

describe("author media publication", () => {
  it("sends regular author submissions to review", () => {
    assert.equal(
      getPublicationStatusAfterAuthorSubmit({ canPublishMediaWithoutReview: false }),
      "submitted",
    );
  });

  it("publishes immediately when author profile allows it", () => {
    assert.equal(
      getPublicationStatusAfterAuthorSubmit({ canPublishMediaWithoutReview: true }),
      "published",
    );
  });

  it("allows publication request from private or rejected status", () => {
    assert.equal(canAuthorRequestPublication("private"), true);
    assert.equal(canAuthorRequestPublication("rejected"), true);
    assert.equal(canAuthorRequestPublication("submitted"), false);
    assert.equal(canAuthorRequestPublication("published"), false);
  });

  it("allows authors to withdraw only submitted media items", () => {
    assert.equal(canAuthorWithdrawPublicationRequest("submitted"), true);
    assert.equal(canAuthorWithdrawPublicationRequest("private"), false);
    assert.equal(canAuthorWithdrawPublicationRequest("rejected"), false);
    assert.equal(canAuthorWithdrawPublicationRequest("published"), false);
  });

  it("allows authors to delete only draft-like media items", () => {
    assert.equal(canAuthorDeleteMediaItem("private"), true);
    assert.equal(canAuthorDeleteMediaItem("rejected"), true);
    assert.equal(canAuthorDeleteMediaItem("submitted"), false);
    assert.equal(canAuthorDeleteMediaItem("published"), false);
  });
});
