import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canAuthorCreateFranchise,
  canAuthorDeleteMediaItem,
  canAuthorRequestPublication,
  canAuthorWithdrawPublicationRequest,
  getAuthorMediaPublicationConfirmDescription,
  getFranchisePublicationStatusAfterAuthorCreate,
  getFranchisePublicationStatusAfterAuthorSubmit,
  getPublicationStatusAfterAuthorSubmit,
} from "../src/lib/authors/media-publication";

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

  it("allows every author to create a franchise and applies its independent publication right", () => {
    assert.equal(canAuthorCreateFranchise({ canPublishFranchisesWithoutReview: false }), true);
    assert.equal(canAuthorCreateFranchise({ canPublishFranchisesWithoutReview: true }), true);
    assert.equal(
      getFranchisePublicationStatusAfterAuthorCreate({ canPublishFranchisesWithoutReview: false }),
      "private",
    );
    assert.equal(
      getFranchisePublicationStatusAfterAuthorCreate({ canPublishFranchisesWithoutReview: true }),
      "published",
    );
    assert.equal(
      getFranchisePublicationStatusAfterAuthorSubmit({ canPublishFranchisesWithoutReview: false }),
      "submitted",
    );
    assert.equal(
      getFranchisePublicationStatusAfterAuthorSubmit({ canPublishFranchisesWithoutReview: true }),
      "published",
    );
  });

  it("mentions admin review only for authors who cannot publish immediately", () => {
    assert.equal(
      getAuthorMediaPublicationConfirmDescription({
        canPublishMediaWithoutReview: false,
        title: "The Legend of heroes: Trails in the sky the 2nd chapter",
      }),
      "Если администратор одобрит «The Legend of heroes: Trails in the sky the 2nd chapter», запись попадет в общую базу и пропадет из черновиков. После этого ты уже не сможешь ее редактировать или удалить из предложений.",
    );

    assert.equal(
      getAuthorMediaPublicationConfirmDescription({
        canPublishMediaWithoutReview: true,
        title: "The Legend of heroes: Trails in the sky the 2nd chapter",
      }),
      "Запись «The Legend of heroes: Trails in the sky the 2nd chapter» сразу попадет в общую базу и пропадет из черновиков. После этого ты уже не сможешь ее редактировать или удалить из предложений.",
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
